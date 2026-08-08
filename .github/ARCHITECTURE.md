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

An ordinary push runs the Integrity Pipeline and stops there. A release starts
when an annotated `v*.*.*` tag reaches origin — and the CLI pushes that tag, not
CI. A tag pushed with a workflow's own `GITHUB_TOKEN` dispatches nothing
(GitHub's recursion guard), so a tag created in CI would sit in the repository
publishing nothing; pushing it under the developer's own credentials is what
starts the release run.

```
Developer runs:  eser codebase release patch
                 ├─ versions.ts (bump VERSION + sync packages)
                 ├─ changelog-gen.ts (auto-generate CHANGELOG)
                 ├─ git commit "chore(codebase): release v<version>"
                 ├─ git push                     ──▶ PUSH TO BRANCH
                 └─ git tag -a v<version> + push ──▶ TAG PUSH v*.*.*

┌─ PUSH TO BRANCH ────────────────────────────────────────────┐
│  build.yml (Integrity Pipeline) — every ordinary push       │
│  ├─ validate            deno task cli ok (Deno + Go)        │
│  ├─ cross-runtime-test  deno / node / bun × linux / macos   │
│  └─ windows-smoke       compiles the Windows artifacts and  │
│                         runs etc/scripts/install.ps1        │
└─────────────────────────────────────────────────────────────┘

┌─ TAG PUSH v*.*.* ───────────────────────────────────────────┐
│  build.yml (same file) — the release run                    │
│  validate                                                   │
│   └─ release-gate   tag == VERSION, and CHANGELOG.md has    │
│       │              the matching section — both checked    │
│       │              BEFORE anything is published           │
│       ├─ smoke-test                                         │
│       │   └─ npm-no-deno-test                               │
│       │       └─ publish        JSR + npm                   │
│       │           └─ release-notes  changelog section       │
│       │                              → GitHub Release       │
│       └─ build-ajan-darwin                                  │
│           └─ compile-binaries  eser, noskills, laroux       │
│               │  (deno compile) + noskills-server (go)      │
│               │  → <binary>-v<version>-<triple>.tar.gz      │
│               │    and SHA256SUMS.txt                       │
│               ├─ publish-ajan  @eserstack/ajan platform     │
│               │                packages (leaf)              │
│               └─ upload-assets  cosign signatures +         │
│                   │  SHA256SUMS. Also needs release-notes:  │
│                   │  gh cannot attach assets to a Release   │
│                   │  that does not exist yet.               │
│                   ├─ update-homebrew   → eser/tap           │
│                   └─ update-nix-hashes → flake.nix          │
└─────────────────────────────────────────────────────────────┘

┌─ OTHER ────────────────────────────────┐
│  pr-labeler.yml (PRs only)             │
│  codeql.yml (main branch + schedule)   │
└────────────────────────────────────────┘
```

`eser codebase rerelease` deletes the tag and recreates it at HEAD, re-firing
the whole run; `eser codebase unrelease` deletes the tag and the GitHub Release,
leaving the release commit in history. Neither is safe once a registry has
accepted the version — JSR is immutable (yank only) and npm answers a republish
with 403 — so after `publish` or `publish-ajan` has written anything, re-run the
failed jobs for an infrastructure error or cut a new patch version for a code
fix.

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
