# Architecture Guide

This guide explains how the eserstack codebase is organized.

## File Structure

```
stack/
├── apps/
│   └── services/               # Go services (independent git-tag versioning)
│       ├── cmd/                # Application entrypoints
│       ├── pkg/api/            # Core application logic
│       │   ├── adapters/       # External integrations (composition root)
│       │   └── business/       # Pure business logic (no external deps)
│       ├── go.mod, go.sum      # Go module definition + tool directives
│       ├── Makefile            # Go-specific build targets
│       └── .golangci.yaml      # Go linting rules
├── pkg/                        # All publishable TS packages (unified versioning)
│   ├── @eser/                  # Core packages (29 packages, published to JSR)
│   └── @cool/                  # Community packages (2 packages, published to JSR)
├── etc/
│   ├── templates/              # Project starter templates (library-pkg, go-service)
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
├── Makefile                    # Unified command interface (Deno + Go)
└── CHANGELOG.md                # Release history
```

## Package Dependency Graph

```
Layer 0 — Foundation (no internal deps)
├── @eser/standards             # Cross-platform abstractions (Runtime interface)
├── @eser/primitives            # Primitive data structures
└── @eser/directives            # Ground rules/directives

Layer 1 — Core Utilities (depend on Layer 0)
├── @eser/fp                    # Functional programming (116+ modules)
├── @eser/crypto                # Cryptographic utilities
├── @eser/cs                    # Computer science utilities
└── @eser/parsing               # String/stream parsing

Layer 2 — Infrastructure (depend on Layers 0-1)
├── @eser/di                    # Dependency injection container
├── @eser/events                # Event system
├── @eser/config                # Configuration management
├── @eser/cache                 # Caching utilities
├── @eser/logging               # Logging system
├── @eser/http                  # HTTP utilities
├── @eser/functions             # Function utilities
├── @eser/testing               # Testing utilities
├── @eser/writer                # Output/file writing
├── @eser/shell                 # Shell interaction
├── @eser/collector             # Data collection
└── @eser/codebase              # Codebase analysis/validation

Layer 3 — Framework (depend on Layers 0-2)
├── @eser/jsx-runtime           # Custom JSX runtime
├── @eser/laroux                # Framework core
├── @eser/laroux-server         # Server-side runtime
├── @eser/laroux-bundler        # Bundler adapters
├── @eser/laroux-react          # React integration
├── @eser/bundler               # Bundling system (esbuild WASM)
└── @eser/app-runtime           # Runtime abstraction

Layer 4 — Application (depend on all layers)
└── @eser/cli                   # Main CLI tool (published to npm as `eser`)

Community
├── @cool/cli                   # Cool CLI
└── @cool/lime                  # Lime utilities

Go Services (independent versioning, apps/services/)
└── cmd/serve                   # HTTP server (hexagonal architecture)
```

## Build Pipeline

```
Developer pushes code
        │
        ├── build.yml — Integrity Pipeline (every push/PR)
        │   ├── Integration job
        │   │   ├── Setup: Python + Deno + Go
        │   │   ├── pre-commit hooks (fmt, lint, typos, kebab-case, license headers)
        │   │   ├── Deno validation (fmt, lint, license, types, tests)
        │   │   ├── Go validation (vet, lint, tests) — via make ok chain
        │   │   └── Coverage generation → Codecov
        │
        ├── deployment.yml — Deployment Pipeline (version tags only)
        │   ├── deno publish → JSR (all TS packages, OIDC auth)
        │   └── npm-build + npm publish → npm (@eser/cli only)
        │
        ├── pr-labeler.yml (PRs only)
        │   └── Auto-label based on changed file paths
        │
        └── codeql-analysis.yml (main branch)
            └── JavaScript security scanning
```

## Design Principles

### Hexagonal Architecture

Each package follows a double-layered structure:

- **Domain + Ports** — Pure business logic and interfaces (no external
  dependencies)
- **Adapters** — External implementations (file system, network, etc.)

### Portability

The `@eser/standards/runtime` module provides a cross-platform abstraction
layer, enabling code to run on Deno, browsers, Supabase, Netlify, AWS Lambda,
and Cloudflare Workers.

### Functional Programming First

- Pure functions as the default building block
- Immutable data structures preferred
- Composition over inheritance
- Side effects pushed to the edges (adapters)

### Dependency Injection

The `@eser/di` package provides a container for managing dependencies, enhancing
testability by allowing mock injection without modifying source code.
