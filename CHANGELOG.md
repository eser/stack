# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v4.1.61] - 2026-08-08

### Fixed

- **codebase**: stage only tracked pathspecs during release (20b5c71)
- **codebase**: report correct target version in dry-run release (77cdebf)

### Changed

- docs structure. (35889e5)
- **cli**: make system handlers app-aware, share PATH lookup (168a99f)
- **cli**: ship noskills and laroux as deno-compiled binaries (c58e6bc)

## Unreleased

### Added

- **codebase:** `validate-server-loc` — generic per-directory LOC ceiling
  validator. Configurable via `directory` (required), `maxLines`,
  `excludeSuffix`, `extension`. Replaces `scripts/noskills-server-loc-check.ts`;
  now wired into precommit on `pkg/ajan/noskillsserverfx`.
- **codebase:** `validate-error-coverage` — generic error-struct field-coverage
  validator. Configurable via `file` (required), `errorObjects`,
  `requiredFields`. Replaces `scripts/noskills-error-coverage.ts`; now wired
  into precommit on `pkg/ajan/noskillsserverfx/errors.go`.

- **kit:** `kit clone` whole-repo mode — repos without `recipe.json` (or with an
  empty one) now copy the entire tree via tarball fetch instead of failing.
- **kit:** `--interactive`/`-i` flag and TTY auto-detect — prompts for missing
  variables when stdin is a terminal, with regex retry on `pattern`.
- **kit:** `--no-post-install` flag — skips post-install commands.
- **kit:** GitHub subpath specifier `gh:owner/repo/sub/path[#ref]`.
- **kit:** stub providers for `npm:` and `jsr:` — parse accepted, `fetch` throws
  "not yet implemented" with a tracking URL.
- **kit:** "Variables applied:" pretty-print to stderr before writing files.
- **kit:** positional target dir — `eser kit clone <specifier> [target-dir]`.
- **kit:** binary file detection in whole-repo mode (33-extension blocklist) to
  avoid mangling PNGs, ZIPs, fonts, etc.
- **kit:** `{{.var}}` substitution now applies to file and directory **names**
  in addition to file contents.

### Changed

- **kit:** `Recipe` schema fields `name`, `description`, `language`, `scale`,
  `files` are now optional in standalone `recipe.json` (lenient clone path).
  Registry entries still require them via `isRegistryRecipe`.
- **build:** the Go shared library is built with `-ldflags=-s -w`, dropping the
  symbol table and DWARF: 40.9 MB → 34.7 MB, measured on darwin/arm64. It is
  copied into every archive that needs FFI, so the saving is paid per binary per
  platform. Nothing consumed the symbols — the library is loaded through a C
  ABI, and Go panics still print stacks from runtime tables.
- **standards:** `formatNumber` no longer uses `toLocaleString`. Its documented
  contract is `"1,000,000"` — a fixed format, not a localised one — so a
  locale-dependent implementation was already wrong, and it returns the
  unseparated string entirely under `deno compile --engine quickjs`, which has
  no Intl. Its test asserted `.includes("1")` and `.includes("000")`, both true
  of `"1000000"`, so it could not observe the behaviour it was named for; it now
  asserts the exact string.
- **cli:** `noskills` and `laroux` ship as standalone binaries again, but are no
  longer separate implementations. `cmd/noskills` was 1,563 lines of Go covering
  a subset of the same commands as `eser noskills` — a fork of the behaviour,
  free to drift, and it had. Both binaries are now `deno compile` entry points
  that mount the SAME module object the `eser` CLI mounts, re-rooted, so
  `noskills next` and `eser noskills next` are one code path with nothing to
  keep in sync. `brew install noskills` and `brew install eser` both work; the
  tap gets a formula per binary.

  `compile.ts` grew a `BINARIES` list and the homebrew updater a matching
  `FORMULAS` list — adding a binary is an entry in each, never an
  implementation. GoReleaser is gone entirely: `compile.ts` cross-builds
  `noskills-server` alongside the deno-compiled binaries, so one pipeline
  releases the whole family at one version into one `SHA256SUMS.txt`.
- **acp:** the `eser-acp` binary is gone. `pkg/ajan/acpfx/shim` is Go code
  linked into the same binary as its callers, so reaching it through a
  subprocess meant `aifx` and `noskillsserverfx` serialising JSON down a pipe to
  a struct they already had in memory — and paying for a second executable to be
  built, shipped, installed, put on PATH, probed for, and explained when absent.
  `acpfx.InProcess` links the two over an in-memory pipe instead; the protocol,
  handshake and capability negotiation are unchanged. `acpfx.Spawn` remains for
  agents that genuinely are other programs (`gemini --acp`, `claude-agent-acp`),
  selectable with `NOSKILLS_ACP_COMMAND`.

  Removed with it: the goreleaser build and brew install line, `ShimCommand` and
  `ShimMissingHint`, the `shimIsAvailable()` PATH probe and ACP provider gating
  in `ajan-bridge.ts`, the shim half of both installers, and the `eser-acp`
  steps in the Windows CI job. **`binPath` on an ACP provider now names the
  vendor CLI** (claude, kiro, opencode) rather than the shim.

  The rewritten tests also corrected a claim the old ones only appeared to
  prove: tool-call surfacing was asserted against the `opencode` backend, but
  passed only because the fake replaced the whole shim. `mapOpenCodeEvent`
  classifies text, done and error and has no tool-call path, so opencode cannot
  surface one. That test now runs against `claude-code`, which does.
- **repo:** the top-level `scripts/` directory is gone; its files moved into
  `etc/scripts/`, which already held the repo's tooling. The installers
  collapsed into **one** `etc/scripts/install.sh` that takes the product as an
  argument (`| sh -s noskills-server`), with `install.ps1` as its Windows
  counterpart (`-Product`). **The public install URL changed** —
  `main/scripts/install.sh` is now `main/etc/scripts/install.sh`. The old URL
  never completed a successful install, so no working setup breaks.
- **codebase:** `WalkSourceFiles` now enumerates untracked-but-not-ignored files
  via `git ls-files --others --exclude-standard`. It previously listed only
  files already in the index, so every validator built on it — runtime-API
  portability, licence headers, filenames, secrets — silently skipped files that
  had been created but never committed. New code is the code most likely to be
  wrong, and it was the only code exempt. The function's own doc comment had
  always claimed untracked files were included.
- **standards:** `FileInfo.mode` and `RuntimeProcess.isAlive(pid)` added to the
  cross-runtime surface. Both existed only as runtime-specific globals before,
  which meant callers either reached for `Deno.*` (breaking under Node) or could
  not express the check at all.
- **ai:** the `claude-code` adapter honours `properties.cwd`, and omits
  `--model` when the configured model is empty. It previously ignored cwd — so
  the same config rooted the agent at the project on the ACP path and at the
  caller's directory on the TypeScript one — and pushed a dangling `--model`
  flag that the CLI rejects.
- **noskills:** `noskills run` drives each iteration through the ai package's
  `claude-code` provider instead of a raw `claude -p` shell-out, and records the
  iteration itself. Previously it discarded the agent's output entirely and
  learned what happened only by re-reading `state.json`, which Claude Code's
  Stop hook was expected to have written — with nothing verifying that it had.
  If the hook was absent or misconfigured, state never moved, the same prompt
  was rebuilt and re-sent, and the loop burned every one of `--max-iterations`
  before reporting "Max iterations reached" rather than the real fault. The loop
  now also surfaces the turn's `stopReason`, so `end_turn`, `max_tokens`,
  `refusal` and `cancelled` are no longer indistinguishable. `execution.driver`
  marks which writer owns the turn so the Stop hook stands down while the loop
  is driving; the two used to be capable of racing read-modify-writes on one
  file. Iteration recording is now a single shared implementation
  (`state/iteration.ts`) with both callers routed through it. Provider selection
  is unchanged in effect where `eser-acp` is absent: the pure-TypeScript adapter
  runs the same vendor binary in the same mode.
- **ai:** `ai ask` default models refreshed across every provider whose default
  had gone stale: `anthropic` and `claude-code` to `claude-sonnet-5` (from the
  dated snapshot `claude-sonnet-4-20250514`), `openai` to `gpt-5.6-terra` (from
  `gpt-4o`, whose `2024-05-13` snapshot has an announced shutdown), and `gemini`
  and `vertexai` to `gemini-3.6-flash` (from `gemini-2.0-flash`, already past
  its shutdown date — Google names 3.6 Flash as its replacement). Two rules now
  govern the table: aliased IDs rather than dated snapshots, so a default tracks
  its tier instead of freezing on the day it was typed; and the balanced tier
  rather than the flagship, since this is what a bare `ai ask` gets. Pass
  `--model` or set `ConfigTarget.Model` for a flagship or a pinned snapshot.
  Note Gemini 3.6 Flash silently ignores `temperature`/`topP`; the Google
  adapters send only those two, so no request breaks, but they have no effect.
- **ajan:** the six `@eserstack/ajan-*` platform `optionalDependencies` (and the
  generated `@eserstack/ajan` dependency of the published CLI) widened to admit
  `^5.0.0` alongside their existing floor. Resolution is unchanged today — no
  resolved version in `pnpm-lock.yaml` moved — but the ranges no longer have to
  be edited during the v5.0.0 bump, which is the step whose omission would be
  silent: an `optionalDependency` matching nothing is dropped by pnpm rather
  than erroring, leaving a stale native binary against a new ABI.
  `codebase/ajan-ranges.test.ts` now enforces that every declared range admits
  the root `VERSION`.

### Removed

- **codebase:** `eser codebase scaffolding` command — use
  `eser kit clone <specifier>` instead.
- **codebase:** `eser codebase init` alias for scaffolding — removed without
  shim; use `eser kit clone`.
- **codebase:** `@eserstack/codebase/scaffolding` JSR export — replaced by
  `@eserstack/kit/recipes`.
- **noskills-client:** `DeltaEvent`, `ToolStartEvent` and `ToolResultEvent`
  removed from the `DaemonEvent` union. **Breaking.** Nothing has ever emitted
  them — the daemon's only translation point (`noskillsserverfx/fanout.go`) has
  no case for `delta`, `tool_start` or `tool_result`, and neither worker sends
  them. A client narrowing on those variants was matching on dead branches.
  Assistant text and tool calls arrive inside `SdkEvent` (`sdk_event`), which
  the same release adds to the union for the first time.

### Migration

- `eser codebase scaffolding gh:owner/repo` → `eser kit clone gh:owner/repo`
- `eser codebase init` → `eser kit clone <specifier>`
- `--var key=value` and `--interactive` work identically
- `--skip-post-install` is now `--no-post-install`
- YAML `.eser/manifest.yml` is no longer read; use `recipe.json` (`variables`,
  `postInstall`, `ignore`) instead

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

- **ai:** introducing @eserstack/ai

## 4.1.15 - 2026-03-26

### Added

- **shell:** scalable module system.

### Fixed

- **codebase:** prompt was incorrectly placed.

## 4.1.14 - 2026-03-26

### Added

- **streams:** introducing @eserstack/streams

## 4.1.13 - 2026-03-25

### Added

- **streams:** introducing @eserstack/streams.

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
- added formatting utilities in @eserstack/standards for better number, size,
  duration, and percentage representation.
- introduced new utilities in the @eserstack/standards package, including date
  and time formatting, internationalization, and string interpolation functions.
- **fp:** introduced new utility functions, including chunk, get, groupBy,
  keyBy, and memoize, along with their respective tests and benchmarks.
- added @eserstack/primitives package to provide utility functions and promises.
- CLI and documentation enhancements
- ***:** add FakeServer and temp directory utilities for testing
- **@eserstack/cs:** minor changes to ready shipping.
- ***:** bump all versions feature

### Changed

- **laroux:** update project structure and configuration for laroux-app
- **laroux:** enhance regex patterns to prevent ReDoS vulnerabilities
- **laroux:** enhance global type definitions for Laroux runtime
- **laroux:** add return types to various functions for improved type safety
- **bundler:** streamline module and chunk manifest generation
- **standards:** simplify runtime entry points by consolidating to a single
  default path.
- **@eserstack/cs:** remove builders and config files; update CLI and generate
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
- **@eserstack/cli:** --help identifier fix.
- jsr package name resolution bug.
- ensure output writer lock is released on write failure
- **scripts:** version bump script
- **scripts:** deno.jsonc -> deno.json
