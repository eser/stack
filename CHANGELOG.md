# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- **noskills:** AskUserQuestion confirmation tokens — mechanical enforcement
  that agents asked the user before submitting discovery answers. Per-question
  STATED/INFERRED marking via PostToolUse hook
  (`noskills invoke-hook post-ask-user-question`) and next.ts validation.
- **noskills:** merged listen-first + mode selection entry menu with recursive
  context-sharing.
- **noskills:** automatic spec classification from discovery text, with
  REFINEMENT confirmation.
- **noskills:** userContext migration from `string` → `readonly string[]` with
  backward-compat shim in persistence.normalizeStateShape.

### Changed

- **noskills:** behavioral platforms (Cursor, Windsurf, Copilot) now default
  discovery answers to INFERRED since they lack PostToolUse hook support.
  REFINEMENT will surface all answers for confirmation on these platforms.

## 4.1.56 - 2026-04-06

### Changed

- **ajan:** lazy-load FFI backends with async open
- **noskills:** rename REVIEW→REFINEMENT, DRAFT→PROPOSAL phases
- **noskills:** update phase names, add Jidoka enforcement and review dimensions

## 4.1.55 - 2026-04-05

### Added

- **noskills,codebase:** add Jidoka enforcement, review dimensions, ajan version
  sync

## 4.1.54 - 2026-04-04

### Added

- **noskills,shell:** add learnings, diagrams, follow-ups, xterm vterm
- **shell,noskills:** add TUI widget system and spec delegation workflow

### Fixed

- **ajan,cli:** use .wasm.bin variant to bypass deno compile wasm validation

## 4.1.53 - 2026-04-04

### Added

- **noskills,shell:** add learnings, diagrams, follow-ups, xterm vterm
- **shell,noskills:** add TUI widget system and spec delegation workflow

## 4.1.52 - 2026-04-02

### Fixed

- **noskills-web:** sanitize error responses and add missing dependency

## 4.1.51 - 2026-04-02

### Added

- **noskills:** add web dashboard, event system, and TUI tab bar
- **noskills:** add project root discovery and two-tier rule delivery
- **noskills:** add multi-user identity, discovery modes, and plan-based specs

### Changed

- **noskills:** remove FREE phase, make IDLE default permissive state and
  auto-generate spec slugs

### Fixed

- **codebase:** validate all path parts upfront and fix nested object traversal
  in setPropertyByPath
- **ai:** pipe prompts via stdin to avoid E2BIG on large inputs
- **shell:** suppress pty tcgetattr noise and skip type-check on compile

## 4.1.50 - 2026-04-02

### Added

- **noskills:** add multi-user identity, discovery modes, and plan-based specs

### Changed

- **noskills:** remove FREE phase, make IDLE default permissive state and
  auto-generate spec slugs

### Fixed

- **codebase:** validate all path parts upfront and fix nested object traversal
  in setPropertyByPath
- **ai:** pipe prompts via stdin to avoid E2BIG on large inputs
- **shell:** suppress pty tcgetattr noise and skip type-check on compile

## 4.1.49 - 2026-04-01

### Added

- **noskills:** add multi-user identity, discovery modes, and plan-based specs
- **noskills:** add pack management system and consolidate ajan build targets

## 4.1.48 - 2026-04-01

### Added

- **noskills:** add pack management system and consolidate ajan build targets

## 4.1.47 - 2026-04-01

### Added

- **ajan,noskills,shell:** add ajan Go bridge, noskills manager, and shell TUI
  primitives

### Changed

- **ajan:** replace node:ffi with koffi for Node.js FFI backend
- **ajan:** simplify FFI env vars and remove per-runtime backend selection

### Fixed

- ***:** broaden Go version regex, use relative imports, and normalize YAML
  formatting
- ***:** harden regex patterns against ReDoS and patch prototype pollution
- **ajan:** update error messages to recommend package install over local build

## 4.1.46 - 2026-04-01

### Added

- **ajan,noskills,shell:** add ajan Go bridge, noskills manager, and shell TUI
  primitives

### Changed

- **ajan:** replace node:ffi with koffi for Node.js FFI backend
- **ajan:** simplify FFI env vars and remove per-runtime backend selection

### Fixed

- ***:** harden regex patterns against ReDoS and patch prototype pollution
- **ajan:** update error messages to recommend package install over local build

## 4.1.45 - 2026-04-01

### Added

- **ajan,noskills,shell:** add ajan Go bridge, noskills manager, and shell TUI
  primitives

### Changed

- **ajan:** replace node:ffi with koffi for Node.js FFI backend
- **ajan:** simplify FFI env vars and remove per-runtime backend selection

## 4.1.44 - 2026-03-30

### Added

- **noskills:** add spec splitting, git write-bypass detection, and batch task
  completion

## 4.1.43 - 2026-03-30

### Added

- **noskills:** add FREE mode, OpenCode/Codex/Copilot CLI adapters, and live
  state machine coaching

## 4.1.42 - 2026-03-30

### Added

- **noskills:** add per-tool interaction hints and require explicit --spec flag

## 4.1.41 - 2026-03-29

### Added

- **noskills:** add adapter pattern for sync engine with full Kiro integration

## 4.1.40 - 2026-03-29

### Changed

- **noskills:** update Twitter handle typo

## 4.1.39 - 2026-03-29

### Added

- **noskills:** discovery review phase, verifier agent, --spec flag
- **noskills:** deep discovery, ID-based debt, sub-agent delegation

## 4.1.38 - 2026-03-29

### Added

- **noskills:** discovery review phase, verifier agent, --spec flag
- **noskills:** deep discovery, ID-based debt, sub-agent delegation

## 4.1.37 - 2026-03-28

### Added

- **noskills:** make discovery phase probe deeper instead of relaying verbatim

## 4.1.36 - 2026-03-28

### Added

- **noskills:** batch concern add, phase-aware options, one-at-a-time discovery
  flow

## 4.1.35 - 2026-03-28

### Added

- **noskills:** use PATH-based CLI detection and update setup docs

### Fixed

- **codebase:** harden regex patterns and prototype pollution guards

## 4.1.34 - 2026-03-28

### Added

- **noskills:** replace availableActions with interactiveOptions for native tool
  UX

## 4.1.33 - 2026-03-28

### Added

- **noskills:** add agent detection, session-start hook, and IDLE actions

## 4.1.32 - 2026-03-28

_Maintenance release._

## 4.1.31 - 2026-03-28

### Added

- **noskills:** replace filesystem concern loading with static imports

## 4.1.30 - 2026-03-28

### Added

- **standards:** add TTY detection and raw mode to cross-runtime process

## 4.1.29 - 2026-03-28

### Added

- **noskills:** add execution engine, hooks, TUI prompts, and output formatting

## 4.1.28 - 2026-03-27

### Changed

- ***:** consolidate all config under .eser/ directory

## 4.1.27 - 2026-03-27

### Fixed

- **codebase:** emit maintenance release section instead of throwing on
  chore-only changelogs

## 4.1.25 - 2026-03-27

### Changed

- **standards:** rename runtime to cross-runtime, registry to collections

## 4.1.24 - 2026-03-27

### Added

- **codebase:** add group aliases in help, fix semver version check

## 4.1.22 - 2026-03-27

### Added

- **cli:** add "." alias for codebase submodule

## 4.1.20 - 2026-03-26

### Changed

- **laroux:** split server/CLI into laroux-server and slim down laroux to shared
  types

## 4.1.19 - 2026-03-26

### Added

- **noskills:** introducing noskills.

## 4.1.18 - 2026-03-26

### Fixed

- **workflows:** circular dependency issues is fixed by removing codebase
  dependency.

## 4.1.17 - 2026-03-26

### Fixed

- **stream:** circular dependency issues is fixed by removing encode/decode
  exports.

## 4.1.16 - 2026-03-26

### Added

- **ai:** introducing @eser/ai

## 4.1.15 - 2026-03-26

### Added

- **shell:** scalable module system.

### Fixed

- **codebase:** prompt was incorrectly placed.

## 4.1.14 - 2026-03-26

### Added

- **streams:** introducing @eser/streams

## 4.1.13 - 2026-03-25

### Added

- **streams:** introducing @eser/streams.

## 4.1.12 - 2026-03-19

### Fixed

- **ci:** allow homebrew/nix update jobs to fail when app credentials missing.
- **ci:** skip homebrew/nix jobs when app credentials not configured.

## 4.1.11 - 2026-03-19

### Fixed

- **ci:** add checkout step to upload-assets job.

## 4.1.10 - 2026-03-19

### Changed

- **deps:** bump google.golang.org/grpc from 1.79.2 to 1.79.3 in /apps/services

## 4.1.9 - 2026-03-18

### Fixed

- **codebase:** convert validate-licenses to createFileTool factory

## 4.1.8 - 2026-03-16

### Fixed

- **codebase:** fixed changelog generation scripts

## 4.1.7 - 2026-03-16

### Fixed

- **codebase:** fixed changelog generation scripts.

## 4.1.6 - 2026-03-16

### Added

- **codebase:** gh sub-commands
- **codebase:** release, rerelease and unrelease commands.

### Changed

- ***:** updated documentations.

## 4.1.5 - 2026-03-14

### Added

- **codebase:** categorized codebase tools.
- **codebase:** updated validate-commit-msg tool to support multiple and
  asterisk scope.

## 4.1.4 - 2026-03-14

### Added

- **codebase:** categorized codebase tools.
- **codebase:** updated validate-commit-msg tool to support multiple and
  asterisk scope.

## 4.1.3 - 2026-03-14

### Fixed

- **codebase:** resolved some security issues

## 4.1.2 - 2026-03-14

### Added

- **standards:** walk and colors features for various runtimes.
- **functions:** context-aware tasks, and adapters.
- **bundler:** add Deno module resolution fallback for npm packages
- **bundler:** add projectRoot configuration for module resolution
- **bundler:** enhance Deno bundler output mapping for entry keys
- **bundler:** enhance server action handling with client stubs and reference
  symbols
- **bundler:** implement server action transformation and manifest generation
- **bundler:** add server externals plugin to bundler configuration
- **bundler:** enhance server and client bundling with externals support
- **bundler:** implement policy for external import specifiers in bundling
  process
- add support for imports, dependencies, and devDependencies in package loader
- **laroux:** laroux packages are introduced.
- **bundler:** introduce new testing framework and enhance CSS processing
  capabilities
- added formatting utilities in @eser/standards for better number, size,
  duration, and percentage representation.
- introduced new utilities in the @eser/standards package, including date and
  time formatting, internationalization, and string interpolation functions.
- **fp:** introduced new utility functions, including chunk, get, groupBy,
  keyBy, and memoize, along with their respective tests and benchmarks.
- added @eser/primitives package to provide utility functions and promises.
- CLI and documentation enhancements
- ***:** add FakeServer and temp directory utilities for testing
- **@eser/cs:** minor changes to ready shipping.
- ***:** bump all versions feature

### Changed

- **laroux:** update project structure and configuration for laroux-app
- **laroux:** enhance regex patterns to prevent ReDoS vulnerabilities
- **laroux:** enhance global type definitions for Laroux runtime
- **laroux:** add return types to various functions for improved type safety
- **bundler:** streamline module and chunk manifest generation
- **standards:** simplify runtime entry points by consolidating to a single
  default path.
- **@eser/cs:** remove builders and config files; update CLI and generate
  functionality
- bumped to deno version 2.x

### Fixed

- **codebase:** resolved some security issues
- **codebase:** check-licenses pwd fix.
- shebang consideration.
- **bundler:** update import map resolver for object property access.
- **bundler:** enhance import map resolver
- **bundler:** prevent import path rewriting for action modules
- **bundler:** include server action files in server bundling process
- **laroux:** mark action-registry as external in the bundler configuration to
  ensure bundled actions share the server's registry.
- **laroux:** update dynamic import paths in middleware and route dispatchers to
  comply with Deno's publishing requirements by using file:// protocol.
- **laroux:** mark action-registry as external in the bundler configuration to
  prevent inlining of a local copy, ensuring shared usage of the server's
  registry.
- **laroux:** ensure dynamic imports of server actions are assigned to a
  variable to comply with Deno's publishing requirements, improving import
  handling.
- **laroux:** improved server action loading logic in main.ts to check for the
  existence of the actions file before attempting to import it, providing better
  error handling.
- excluded templates from deno tooling.
- added .npmrc files to templates.
- **laroux:** npm publishing fix.
- **laroux:** improve handling of undefined values in logging and JSR resolver
  plugin
- **laroux:** improve handling of undefined values in various functions
- **laroux:** improve error handling and path management in various functions
- **bundler:** update main entrypoint handling to support null values and custom
  entry names
- **bundler:** update Tailwind CSS plugin reference in deno.json to use
  tailwind-plugin.ts.
- **bundler:** enhance chunk extraction logic to locate component exports when
  proxy files are absent.
- **bundler:** enhance map decoding logic to handle null values more
  effectively.
- **bundler:** improve buffer decoding to handle null/undefined inputs safely.
- **bundler:** the referenceFile is calculated as a relative path from the CSS
  module's directory.
- **logging:** specify FormatterFn type for default text and ANSI color
  formatters for improved type safety.
- **bundler:** ensure stop method returns a promise for consistent behavior.
- updated validation commands in package.json to use the new validation
  structure for licenses.
- **@eser/cli:** --help identifier fix.
- jsr package name resolution bug.
- ensure output writer lock is released on write failure
- **scripts:** version bump script
- **scripts:** deno.jsonc -> deno.json
