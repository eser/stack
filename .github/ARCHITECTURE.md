# Architecture Guide

This guide explains how the eserstack codebase is organized.

## File Structure

```
stack/
├── cmd/
│   └── ajan/                   # Go CLI entrypoint (go run ./cmd/ajan)
├── pkg/
│   ├── ajan/                   # Go library (github.com/eser/stack/pkg/ajan)
│   │   ├── api/adapters/       # Composition root (appcontext)
│   │   ├── httpclient/         # HTTP client with circuit breaker
│   │   ├── logfx/              # Structured logging
│   │   ├── configfx/           # Configuration loading
│   │   └── ...                 # Other Go utilities
│   └── @eserstack/             # TypeScript packages (published to JSR + npm)
├── etc/
│   ├── registry/               # Recipe registry (24 recipes: project templates + Go components)
│   ├── scripts/                # Automation scripts (version-bump, release-notes)
│   └── coverage/               # Test coverage output (gitignored)
├── docs/                       # Generated HTML documentation
├── .claude/
│   ├── skills/                 # Claude Code skill definitions (14 skills)
│   └── hooks/                  # Claude Code PostToolUse hooks
├── .github/
│   ├── workflows/              # CI/CD pipelines (7 workflows)
│   ├── ARCHITECTURE.md         # This file
│   ├── pr-labeler.yml          # PR auto-labeling rules
│   └── issue-labels.yml        # Issue label definitions
├── deno.json                   # Root Deno config (lint, format, excludes)
├── package.json                # npm workspace root + deno task scripts
├── CLAUDE.md                   # AI development guidelines (symlink → AGENTS.md)
├── AGENTS.md                   # Multi-agent coordination rules
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

Layer 4 — Application (depend on all layers)
└── @eserstack/cli                   # Main CLI tool (published to npm as `eser`)

Go (module github.com/eser/stack, root go.mod)
├── cmd/ajan                    # CLI entrypoint (eser ajan / go run ./cmd/ajan)
└── pkg/ajan                    # Go library (httpclient, logfx, configfx, httpfx...)
```

## Build Pipeline

```
Developer runs:  eser codebase release patch
                 ├─ versions.ts (bump VERSION + sync packages)
                 ├─ changelog-gen.ts (auto-generate CHANGELOG)
                 └─ git commit + git push (commit only, no tag)
                    │
                    ▼
┌─ PUSH TO MAIN ────────────────────────┐
│  build.yml (Integrity Pipeline)       │
│  ├─ integration.yml (reusable)        │
│  │   └─ deno task cli ok              │
│  └─ tag-release (if release commit    │
│      && integration passed)           │
│      └─ creates + pushes v*.*.* tag   │
└───────────────────────────────────────┘
              │ tag push
              ▼
┌─ TAG v*.*.* ──────────────────────────┐
│  deployment.yml (Deployment Pipeline) │
│  ├─ version-check (tag == VERSION)    │
│  ├─ smoke-test (node dist/eser.js)    │
│  │   └─ uploads npm bundle artifact   │
│  └─ publish (JSR + npm + summary)     │
│       └─ downloads npm bundle artifact│
└───────────────────────────────────────┘

┌─ TAG v* ──────────────────────────────┐
│  release-notes-sync.yml               │
│  └─ CHANGELOG.md → GitHub Release     │
└───────────────────────────────────────┘

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
