# Architecture Guide

This guide explains how the eserstack codebase is organized.

## File Structure

```
stack/
├── cmd/
│   └── noskills-server/        # The only Go executable (a daemon)
├── pkg/
│   ├── ajan/                   # Go library (github.com/eser/stack/pkg/ajan)
│   │   ├── acpfx/              # Agent Client Protocol: client, agent, in-process shim
│   │   ├── aifx/               # AI providers (reaches acpfx/shim in-process)
│   │   ├── noskillsserverfx/   # The daemon: sessions, ledger, workers
│   │   ├── httpclient/         # HTTP client with circuit breaker
│   │   ├── logfx/              # Structured logging (also metrics + tracing)
│   │   ├── configfx/           # Configuration loading
│   │   └── ...                 # Other Go utilities
│   └── @eserstack/             # TypeScript packages (published to JSR + npm)
├── etc/
│   ├── scripts/                # install.sh, install.ps1, manifest + formula generators
│   ├── temp/                   # Build output (gitignored)
│   └── coverage/               # Test coverage output (gitignored)
├── docs/
│   ├── api/                    # Generated HTML reference (deno task docs)
│   ├── adr/                    # Architecture decision records (hand-written)
│   └── schema/                 # JSON schemas (hand-written)
├── .eser/
│   ├── recipes/                # Project templates (9)
│   ├── recipes.json            # Recipe registry
│   └── manifest.yml            # Workflows, validators, scripts
├── .claude/
│   ├── skills/                 # Claude Code skill definitions (15 skills)
│   └── hooks/                  # Claude Code PostToolUse hooks
├── .github/
│   ├── workflows/              # CI/CD pipelines (6 workflows)
│   ├── ARCHITECTURE.md         # This file
│   ├── pr-labeler.yml          # PR auto-labeling rules
│   └── issue-labels.yml        # Issue label definitions
├── deno.json                   # Root Deno config (lint, format, excludes)
├── package.json                # npm workspace root + deno task scripts
├── CLAUDE.md                   # AI development guidelines
└── CHANGELOG.md                # Release history
```

## Package Dependency Graph

```
Layer 0 — Foundation (no internal deps)
├── @eserstack/standards             # Cross-platform abstractions (Runtime interface)
├── @eserstack/primitives            # Primitive data structures
└── @eserstack/directives            # Ground rules/directives

Layer 1 — Core Utilities (depend on Layer 0)
├── @eserstack/fp                    # Functional programming (116+ modules)
├── @eserstack/crypto                # Cryptographic utilities
└── @eserstack/parsing               # String/stream parsing

Layer 2 — Infrastructure (depend on Layers 0-1)
├── @eserstack/di                    # Dependency injection container
├── @eserstack/events                # Event system
├── @eserstack/config                # Configuration management
├── @eserstack/cache                 # Caching utilities
├── @eserstack/logging               # Logging system
├── @eserstack/http                  # HTTP utilities
├── @eserstack/functions             # Function utilities
├── @eserstack/testing               # Testing utilities
├── @eserstack/formats               # Bidirectional format conversion (JSON, YAML, CSV, TOML, JSONL)
├── @eserstack/streams               # Universal I/O streaming with composable middleware
├── @eserstack/shell                 # Shell interaction
├── @eserstack/collector             # Data collection
├── @eserstack/cs                    # Config storage (Kubernetes ConfigMap/Secret sync)
└── @eserstack/codebase              # Codebase analysis/validation

Layer 3 — Framework (depend on Layers 0-2)
├── @eserstack/jsx-runtime           # Custom JSX runtime
├── @eserstack/laroux                # Framework core
├── @eserstack/laroux-server         # Server-side runtime
├── @eserstack/laroux-bundler        # Bundler adapters
├── @eserstack/laroux-react          # React integration
├── @eserstack/laroux-runtime        # Application runtime (manifest loading, dev mode)
├── @eserstack/bundler               # Bundling system (esbuild WASM)
└── @eserstack/app-runtime           # Runtime abstraction

Layer 4 — Shipped binaries (depend on all layers)
├── @eserstack/cli               # `eser` — the full CLI
├── @eserstack/noskills          # `noskills` — the same module `eser` mounts, re-rooted
└── @eserstack/laroux-server     # `laroux` — likewise

All three are `deno compile` entry points over the SAME module objects; see
BINARIES in pkg/@eserstack/cli/scripts/compile.ts. They are not forks.

Go (module github.com/eser/stack, root go.mod)
├── cmd/noskills-server         # `noskills-server` — the daemon, the only Go executable
└── pkg/ajan                    # Go library (acpfx, aifx, httpclient, logfx, configfx...)
```

## Agent execution (ACP)

Agent sessions speak the Agent Client Protocol, and the shim that translates ACP
to a vendor CLI is **linked in, not spawned**:

```
aifx / noskillsserverfx
   │  acpfx.InProcess  (net.Pipe — no subprocess, nothing on PATH)
   ▼
pkg/ajan/acpfx/shim
   │
   ▼
claude --print --output-format stream-json   (or kiro / opencode)
```

The shim is Go code compiled into the same binary as its callers, so it is
reached in process rather than over a subprocess pipe: spawning it would mean
shipping, installing and PATH-resolving a program in order to talk to a struct
already in memory. `acpfx.Spawn` is for agents that genuinely are other programs
(`gemini --acp`, `claude-agent-acp`), selected with `NOSKILLS_ACP_COMMAND`.

Only mux sessions still spawn a TypeScript worker, because a terminal pane's
content channel is VT bytes rather than protocol messages. That worker runs
under whichever JS runtime is present — Deno, Bun, or Node ≥ 26, which strips
types natively.

## Shared `system` command tree

`pkg/@eserstack/codebase/cli-system/` owns `install`, `uninstall`, `update`,
`completions`, `version`, `doctor` and `info`, parameterised by a `CliApp` so
each binary gets a tree describing itself. `attachStandardCommands` binds it to
a binary's ROOT command — which is what gives `noskills version` without
`eser noskills version`, since `eser` mounts the very same module object the
standalone binary re-roots.

## Build Pipeline

One pipeline builds and releases the whole family. GoReleaser and a separate
`release.yml` used to publish the Go binaries independently, which is why
releases once carried either the TypeScript artifacts or the Go ones and never
both; both are gone.

```
Developer runs:  eser codebase release patch
                 ├─ versions.ts (bump VERSION + sync packages)
                 ├─ changelog-gen.ts (auto-generate CHANGELOG)
                 └─ git commit + git push (commit only, no tag)
                    │
                    ▼
┌─ PUSH TO MAIN ─────────────────────────────────────────────┐
│  build.yml (Integrity Pipeline)                            │
│  ├─ validate            deno task cli ok (Deno + Go)       │
│  ├─ windows-smoke       compiles the Windows artifacts and │
│  │                      runs etc/scripts/install.ps1       │
│  ├─ cross-runtime-test  deno / node / bun × linux / macos  │
│  └─ tag-release         only on a `chore(codebase): release│
│                         v…` commit; pushes the v*.*.* tag  │
└────────────────────────────────────────────────────────────┘
              │
              ▼
┌─ RELEASE JOBS (same workflow) ─────────────────────────────┐
│  compile-binaries   compile.ts → eser, noskills, laroux    │
│                     (deno compile) + noskills-server (go)  │
│                     → <binary>-v<version>-<triple>.tar.gz  │
│                       and SHA256SUMS.txt                   │
│  upload-assets      signs and uploads every archive        │
│  publish            JSR + npm (eser, noskills, laroux)     │
│  publish-ajan       @eserstack/ajan platform packages      │
│  update-homebrew    one formula per binary → eser/tap      │
│  update-nix-hashes  flake.nix                              │
│  release-notes      CHANGELOG.md → GitHub Release          │
└────────────────────────────────────────────────────────────┘

┌─ OTHER ────────────────────────────────┐
│  pr-labeler.yml (PRs only)             │
│  codeql.yml (main branch + schedule)   │
└────────────────────────────────────────┘
```

## Design Principles

### Hexagonal Architecture

Each package follows a double-layered structure:

- **Domain + Ports** — Pure business logic and interfaces (no external
  dependencies)
- **Adapters** — External implementations (file system, network, etc.)

### Portability

The `@eserstack/standards/cross-runtime` module provides a cross-platform
abstraction layer, enabling code to run on Deno, browsers, Supabase, Netlify,
AWS Lambda, and Cloudflare Workers.

### Functional Programming First

- Pure functions as the default building block
- Immutable data structures preferred
- Composition over inheritance
- Side effects pushed to the edges (adapters)

### Dependency Injection

The `@eserstack/di` package provides a container for managing dependencies,
enhancing testability by allowing mock injection without modifying source code.
