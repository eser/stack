# Architecture Guide

This guide explains how the eserstack codebase is organized.

## File Structure

```
stack/
├── cmd/
│   ├── eser/                   # The eser CLI (Go)
│   ├── noskills/               # The noskills CLI (Go)
│   ├── noskills-server/        # The session daemon (Go)
│   └── legacy-forwarder/       # The laroux stub that v4.5.x binaries update to
├── pkg/
│   ├── ajan/                   # Go library (github.com/eser/stack/pkg/ajan)
│   │   ├── acpfx/              # Agent Client Protocol: client, agent, in-process shim
│   │   ├── aifx/               # AI providers (reaches acpfx/shim in-process)
│   │   ├── noskillsserverfx/   # The daemon: sessions, ledger, workers, dashboard
│   │   ├── httpclient/         # HTTP client with circuit breaker
│   │   ├── logfx/              # Structured logging (also metrics + tracing)
│   │   ├── configfx/           # Configuration loading
│   │   └── ...                 # Other Go utilities
│   └── @eserstack/             # TypeScript and platform packages (npm; JSR frozen at 4.5.x)
├── etc/
│   ├── scripts/                # install.sh, install.ps1, preflight and release-notes helpers
│   ├── temp/                   # Build output (gitignored)
│   └── coverage/               # Test coverage output (gitignored)
├── docs/
│   ├── adr/                    # Architecture decision records (hand-written)
│   ├── agents/                 # Repository notes for agents, linked from AGENTS.md
│   └── schema/                 # JSON schemas (hand-written)
├── .eser/
│   ├── recipes/                # Project templates (7)
│   ├── recipes.json            # Recipe registry
│   └── manifest.yml            # Workflows, validators, scripts
├── .agents/
│   ├── skills/                 # Agent skill definitions (14 skills)
│   ├── hooks/                  # Claude Code PostToolUse hooks
│   └── settings.json           # Claude Code project settings
├── .claude -> .agents          # Symlink so Claude Code reads the same tree
├── .github/
│   ├── workflows/              # CI/CD pipelines (6 workflows)
│   ├── ARCHITECTURE.md         # This file
│   ├── pr-labeler.yml          # PR auto-labeling rules
│   └── issue-labels.yml        # Issue label definitions
├── package.json                # pnpm workspace root, toolchain pins, the `cli` script
├── pnpm-workspace.yaml         # pnpm workspace settings (allowBuilds, release age)
├── tsconfig.json               # tsc 7 type check (`--noEmit`)
├── .oxfmtrc.json               # oxfmt settings and ignore patterns
├── .oxlintrc.json              # oxlint rules and ignore patterns
├── .node-version               # The exact Node version CI and local runs use
├── AGENTS.md                   # AI development guidelines
└── CHANGELOG.md                # Release history
```

## Package Dependency Graph

The `dependencies` in each package's `package.json` place it in a layer. A
package depends only on packages in lower layers, or on packages listed above it
in its own layer.

```
Layer 0: Foundation
├── @eserstack/primitives            # Primitive types and building blocks
├── @eserstack/standards             # Cross-platform abstractions (Runtime interface)
├── @eserstack/directives            # Ground rules/directives (documents only, no package.json)
├── @eserstack/ajan-<platform>       # Prebuilt Go library, one package per platform (six)
├── @eserstack/noskills-<platform>   # The Go noskills binary, one package per platform (five)
└── @eserstack/ajan                  # Go runtime bridge: native FFI with a WASM fallback

Layer 1: Core Utilities
├── @eserstack/fp                    # Pure functional combinators
├── @eserstack/functions             # Workflow compositions (run, middleware, lazy)
├── @eserstack/di                    # Dependency injection container
├── @eserstack/events                # Event system
├── @eserstack/streams               # Universal I/O streaming with composable middleware
├── @eserstack/testing               # Testing utilities
├── @eserstack/crypto                # Cryptographic utilities
└── @eserstack/parsing               # String/stream parsing

Layer 2: Infrastructure
├── @eserstack/config                # Configuration management
├── @eserstack/cache                 # Caching utilities
├── @eserstack/logging               # Logging system
├── @eserstack/http                  # HTTP utilities
├── @eserstack/httpclient            # HTTP client with timeouts, retries and backoff
├── @eserstack/webtransport          # WebTransport client with certificate pinning
├── @eserstack/formats               # Bidirectional format conversion (JSON, YAML, CSV, TOML, JSONL)
├── @eserstack/shell                 # Shell interaction
├── @eserstack/collector             # Module export collector and manifest generator
├── @eserstack/cs                    # Config storage (Kubernetes ConfigMap/Secret sync)
└── @eserstack/mux                   # Terminal multiplexer core: tabs, panes, pseudo-terminals

Layer 3: Services and Tooling
├── @eserstack/agents                # Coding agent discovery and the read-only git guard
├── @eserstack/ai                    # AI provider interface (cloud APIs and local agents)
├── @eserstack/workflows             # Event-driven workflow engine for tool pipelines
├── @eserstack/kit                   # Recipe-based project scaffolding
├── @eserstack/codebase              # Codebase analysis/validation
└── @eserstack/posts                 # Posts on Twitter/X and Bluesky

Layer 4: Framework
├── @eserstack/app-runtime           # Runtime abstraction
├── @eserstack/bundler               # Bundling system (Rolldown backend)
├── @eserstack/laroux                # Framework core
├── @eserstack/laroux-react          # React integration: Link, Image, RSC protocol and client
├── @eserstack/laroux-bundler        # Build pipeline and bundler adapters
└── @eserstack/laroux-server         # Server-side runtime; the `laroux` binary

Layer 5: Applications
├── @eserstack/noskills              # `noskills`: the same module `eser` mounts, re-rooted
├── @eserstack/noskills-client       # Client for a running noskills-server daemon
├── @eserstack/noskills-web          # Browser dashboard that `noskills web` starts
└── @eserstack/cli                   # `eser`: the full CLI

Go (module github.com/eser/stack, root go.mod)
├── cmd/eser                         # `eser`: the release binary of the CLI
├── cmd/noskills                     # `noskills`: the release binary of the spec workflow
├── cmd/noskills-server              # `noskills-server`: the daemon
├── cmd/legacy-forwarder             # The stub shipped under the `laroux` archive name
└── pkg/ajan                         # Go library (acpfx, aifx, httpclient, logfx, configfx...)

Go (module github.com/eser/ajan, pkg/@eserstack/ajan/go.mod)
└── pkg/@eserstack/ajan              # cgo and WASI FFI bridge that @eserstack/ajan loads
```

`@eserstack/ajan` and `@eserstack/cli` list the six platform packages as
optional dependencies. The release binaries are Go commands built by
`eser dev compile` (`ReleaseBinaries` in `pkg/ajan/codebasefx`): `eser`
(`cmd/eser`), `noskills` (`cmd/noskills`) and `noskills-server` (decision-8). On
npm, `noskills` is a launcher: its optional dependencies
`@eserstack/noskills-<platform>` carry the binary (`eser dev npm-binaries`
stages it), and it also carries the TypeScript CLI for the commands the binary
forwards. `laroux` ships on npm only; under its archive name the release ships
`cmd/legacy-forwarder`, a stub that installed v4.5.x laroux binaries update to
and that runs `npx --yes laroux@<version>` (decision-9). The flake builds
`noskills` from source with `buildGoModule`.

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
shipping, installing and PATH-resolving a program to talk to a struct already in
memory. `acpfx.Spawn` is for agents that genuinely are other programs
(`gemini --acp`, `claude-agent-acp`), selected with `NOSKILLS_ACP_COMMAND`.

Mux sessions spawn no worker either: `noskillsserverfx` hosts a `pkg/ajan/muxfx`
server in the daemon, whose panes run on `shellfx/pty` pseudo-terminals, so the
daemon needs no JavaScript runtime.

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
│  ├─ validate            pnpm ok, the Go eser (Node + Go)    │
│  ├─ preflight           pnpm preflight, on main only        │
│  ├─ mux-no-js-runtime   mux sessions with no Node on PATH   │
│  ├─ cross-runtime-test  node × linux / macos                │
│  ├─ node-ffi-cli        the CLI on node:ffi × linux / macos │
│  └─ windows-smoke       compiles the Windows artifacts and  │
│                         runs etc/scripts/install.ps1        │
└─────────────────────────────────────────────────────────────┘

┌─ TAG PUSH v*.*.* ───────────────────────────────────────────┐
│  build.yml (same file) — the release run                    │
│  validate                                                   │
│   └─ preflight      the release-only steps, again on the    │
│       │              tagged tree                            │
│       └─ release-gate  tag == VERSION, and CHANGELOG.md has │
│           │              the matching section, both checked │
│           │              BEFORE anything is published       │
│           ├─ smoke-test                                     │
│           │   └─ npm-consumer-test                          │
│           └─ build-ajan-darwin                              │
│               └─ compile-binaries  eser, noskills, laroux   │
│                   │  stub, noskills-server (all Go)         │
│                   │  → <binary>-v<version>-<triple>.tar.gz  │
│                   │    and SHA256SUMS.txt                   │
│                   └─ publish-ajan  ajan-* and noskills-*    │
│                       │            platform packages on npm │
│                       └─ publish   eser, noskills, laroux   │
│                           │        bundles on npm           │
│                           └─ release-notes  changelog       │
│                               │      section → GitHub       │
│                               │      Release                │
│                               └─ upload-assets  cosign      │
│                                   │  signatures + SHA256SUMS│
│                                   ├─ update-homebrew        │
│                                   │    → eser/tap           │
│                                   └─ update-nix-hashes      │
│                                        → nix/hashes.json    │
└─────────────────────────────────────────────────────────────┘

┌─ OTHER ────────────────────────────────┐
│  pr-labeler.yml (PRs only)             │
│  codeql.yml (main branch + schedule)   │
└────────────────────────────────────────┘
```

`eser codebase rerelease` deletes the tag and recreates it at HEAD, re-firing
the whole run; `eser codebase unrelease` deletes the tag and the GitHub Release,
leaving the release commit in history. Neither is safe once npm has accepted
the version, because npm answers a republish with 403. After `publish` or
`publish-ajan` has written anything, re-run the failed jobs for an
infrastructure error or cut a new patch version for a code fix.

## Design Principles

### Hexagonal Architecture

Each package follows a double-layered structure:

- **Domain + Ports** — Pure business logic and interfaces (no external
  dependencies)
- **Adapters** — External implementations (file system, network, etc.)

### Portability

The `@eserstack/standards/cross-runtime` module is the one place library code
reaches the file system, the environment and processes. Its `node`, `browser`
and `workerd` adapters let the same code run on Node, in browsers and on
Cloudflare Workers; the repository itself runs on Node only (ADR 0005).

### Functional Programming First

- Pure functions as the default building block
- Immutable data structures preferred
- Composition over inheritance
- Side effects pushed to the edges (adapters)

### Dependency Injection

The `@eserstack/di` package provides a container for managing dependencies,
enhancing testability by allowing mock injection without modifying source code.
