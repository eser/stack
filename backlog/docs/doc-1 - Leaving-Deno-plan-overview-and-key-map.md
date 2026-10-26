---
id: doc-1
title: 'Leaving Deno: plan overview and key map'
type: specification
created_date: '2026-10-15 20:39'
---

# eser/stack: one fast cutover from Deno to Node 26, pnpm, oxlint, oxfmt and tsc 7, then move the working parts to Go

Source: the planning run of 2026-10-15 (11 codebase and web sweeps, three plan drafts judged by three reviewers, a completeness critique and a revision). The owner's direction: leave Deno in one fast, complete cutover to Node 26 with pnpm, oxlint, oxfmt and tsc, and move the working parts to Go. Facts: deno.com/blog/cloudflare (2026-10-09) gives the Deno runtime one more year of bug-fix and security releases, no Deno 3, Deno Deploy six more months, and JSR keeps operating on Cloudflare.

## Revision 2026-10-15: keep the bridge on node:ffi

The owner approved this revision on 2026-10-15. It changes how TypeScript reaches Go; everything else in the plan stays.

- Why: the owner's direction is to move business logic and the working parts to Go as much as possible. The c-shared bridge is how a TypeScript library hands its logic to Go inside the process, so it is no longer retired in M6. It stays and becomes the main way TypeScript packages delegate to Go.
- node:ffi: Node's built-in FFI arrived in 26.1.0 behind `--experimental-ffi` and is on by default since 26.9.0 (nodejs/node#65475). It is still "Stability: 1 - Experimental", turns off with `--no-experimental-ffi` and needs `--allow-ffi` under the permission model. Calls are synchronous only, and callbacks must run on the thread that created them; the bridge needs no callbacks, because it is string in, string out, with polling reads for streams.
- One loader order: node:ffi first; if it cannot load, the WASM build (WASI); if that fails too, a clear error and exit. Nothing else. M1-T8 deletes the koffi backend together with the Deno and Bun backends, and koffi leaves every manifest, the npm externals list and allowBuilds; koffi is not a fallback. The platform packages keep only the Go shared library.
- A generic dispatcher: M2-T7 replaces the 100 hand-listed exports with `EserAjanCall(name, requestJson) -> responseJson`, a stream open, read and close trio, `EserAjanFree` and an `EserAjanVersion` handshake. A missing function is an error JSON, not a failed load, and the TypeScript bindings collapse into one table that the parity test checks against the Go registry.
- Worker threads: M2-T8 runs blocking calls (the 8 AI calls, HTTP request and stream reads, shell exec reads, PTY reads, TUI keypress, the network-backed kit and posts calls) in `node:worker_threads` workers that open the library with their own `dlopen`. Each long-lived reader gets its own worker, request and response calls share a bounded pool, an AbortSignal calls the cancel function, and short calls stay synchronous on the main thread.
- Node floor: engines `>=26.9`; .node-version and CI pin the exact minor that passed the M0-T2 spike (decision-14).
- Go owns the working parts: M6 moves the logic that exists only in TypeScript to the matching pkg/ajan *fx package behind the bridge, package by package. Browser code, React and laroux client code, thin adapters and types stay in TypeScript, and shell and ai keep their Go paths. The repo keeps two Go modules.
- WASM: the owner kept the WASI build as the fallback (decision-45). It covers runs where node:ffi cannot load and windows/arm64, which has no platform package. Since 2026-10-24 it is one slim reactor profile on the dispatcher registry (M0-T22, M0-T23), and a name it cannot serve returns error JSON.
- Risk: node:ffi is experimental, and a breaking minor would leave only the WASM fallback, which serves a subset of the calls. The M0-T2 spike measures the dispatcher call, the worker pattern's throughput and cancellation, the teardown SIGSEGV seen under Deno, and stdin, raw mode and SIGWINCH sharing. CI pins the Node minor and runs the FFI suites on every Node bump. If the spike shows the design does not hold, decision-37 records the failure for the owner before M1; koffi is not a fallback.

Decisions changed, all accepted by the owner on 2026-10-15: decision-37 (node:ffi with the dispatcher and worker threads, WASM as the fallback), decision-22 (Go owns business logic and the bridge stays), decision-14 (`>=26.9`) and decision-45 (the WASM fallback stays). Tasks changed: TASK-175 (M0-T2), TASK-202 (M1-T8), TASK-238 (M2-T7), TASK-239 (M2-T8) and TASK-267 to TASK-270 (M6).

## Revision 2026-10-24: slim WASM reactor

The WASM profile spike (etc/temp/plan/ajan-wasm-spike.json) found the WASM build at 80.7 MB, 62% of it AI SDK code that cannot work on wasip1, and command mode at 14-15 ms of CPU per call. The owner accepted:
- decision-45 (amended): one slim wasi profile (44 names, 7.26 MB, 1.41 MB brotli) built as a c-shared reactor, one instance reused per process, 3-27 µs per call; command mode deleted; Node and Cloudflare Workers as hosts (Workers added with the laroux answers); the 10 ms budget is per call; a node:wasi preopen for the fs names; optional OTel in logfx; an early host fetch import. The profile and reactor work moves to M0, ahead of M1-T8.
- decision-55: aifx's providers move from the vendor SDKs to net/http, which takes the bridge dylib from 38.6 MB to about 12.3 MB.
- decision-56: a lazy-compiling fork of jsonschema/v6, kept in-tree with notes for agents.

New tasks: TASK-272 to TASK-276 (M0-T22 to M0-T26), TASK-277 and TASK-278 (M2-T11, M2-T12) and TASK-279 (M6-T5). Tasks changed: TASK-202, TASK-238, TASK-267, TASK-268, TASK-269 and decision-37.

## Approach

This revision keeps the single red window of the previous plan and fixes the gaps the critique found: how root scripts resolve packages, a dependency cycle in the test seam, unowned Deno and Bun leftovers, merge-time breaks in install channels, and the path for users who are already on Deno-era binaries, JSR or npx hooks.

M0 (prepare, Deno gate green) has seven jobs:
- Record every owner decision in ADR 0005. That includes the Go/TS boundary, the allowlist of Deno references that stay on purpose (support for users' own Deno projects, history files), and the root devDependencies policy.
- Start the integration-agent protocol in M0, not M1. One integration agent owns pnpm-lock.yaml and the root package.json from M0-T20 onward, so M0-T13, T14, T15 and T17 never edit the lockfile in parallel. The root gains the devDependencies that root-level code needs: today root node_modules holds only @types, so etc/scripts tests, etc/codemods and .agents scripts cannot resolve anything.
- Run a read-only spike that measures the risky assumptions, including the four node:ffi measurements whose result decision-37 records, and writes each package's hand-work list into that package's M1 task.
- Land every fix that both runtimes accept:
  - erasable syntax only, and no .tsx in laroux-react
  - rolldown as the only bundler; the Deno.bundle backend, the deno repl script, repl-init.ts and the barrel pkg/@eserstack/mod.ts are deleted
  - laroux-server and the posts callback server on runtime.http
  - collector.walkFiles on runtime.fs
  - the npm manifest fixes and exact Node 26 minor (26.9 or later) and pnpm@11.18.0 pins
  - Makefile targets for the ajan builds, with every hint and README that named the deleted Deno scripts updated in the same task
  - a Go validator for camelcase and tagged TODOs that reads comments only and masks string literals
- Add a CI job that runs the eser CLI from source under Node through node:ffi.
- Add a private leaf package, @eserstack/test-kit, with no workspace dependencies, and route all test files to it. @eserstack/testing depends on standards, and validate-circular-deps counts devDependencies, so the seam cannot live there without creating a cycle.
- Write and test the codemods on oxc-parser from the root devDependencies. If the owner chooses (decision jsr-deprecation-notice), prepare a last Deno-era release, 4.5.3, before M1 starts. It carries npm migration notices on JSR and an updater that fails with a readable npm pointer.

M1 is the only red window. It runs on one cutover branch under the owner-approved commit protocol and has three waves:
- Wave A is strictly sequential, with each task depending on the one before it: root configs (M1-T1, including resolveJsonModule for the 31 JSON imports), the oxfmt reformat (T2), the lint-pragma codemod (T3), the test and bench codemods (T4), node as the CLI starter (T5), and the precommit and preflight workflows (T6). Every wave B task depends on M1-T4, and through it on M1-T3, so no worktree branches before the mechanical commits land. Tasks with FFI-backed tests also depend on M1-T8, so no task chases node:ffi failures twice.
- Wave B is package-parallel. Each task also owns the Go twin files and docs that name Deno or Bun in its area, so the final audit has no orphans.
- Wave C deletes what is left. The validator bans Deno and Bun identifier references in code. The `git grep -wi deno` audit matches only the allowlist recorded in ADR 0005.

Bun is dropped completely, in every adapter, handler, invoker, externals list, worker search, mise and flake entry, CI row and description. Code that supports users' own Deno projects stays if the owner keeps it (decision user-deno-projects): noskills project detection, hook network-command recognition, the kit Deno project type, and deno.json reading in user repos.

Install-channel changes are safe at merge time:
- install.sh is served from main and reads releases/latest, so it never refuses statically. Its laroux refusal is gated on the release tag, and for eser and noskills it prints an npm pointer when the release has no matching archive.
- The Homebrew and Nix steps run only for archives that are present in the release.

What stays unchanged in M1 is on purpose: the runtime facade, synchronous node:ffi calls on the existing 100 exports and the @std-backed test-kit. Keeping @std, which is the Deno standard library served from JSR, through M1 is a judgement call the owner makes (decision std-during-cutover). It is not presented as a fact. Nothing published depends on it, and M2 removes it before any release.

M2 makes Node releasable:
- @std and @jsr removal, before any packing
- a tsc 7 emit; tsconfig.build.json drops allowImportingTsExtensions and relies on rewriteRelativeImportExtensions
- a consumer smoke test that installs every tarball together, with overrides for the workspace ranges
- laroux packaging, after the @std removal
- test-kit moved onto node:assert
- a small dispatcher ABI for the Go bridge (M2-T7) and worker threads for blocking FFI calls (M2-T8)
- prepared patches for the external laroux template repos and the homebrew-tap

Go work starts once M0-T1 records the boundary, and it runs in parallel with M1 and M2.
- M3 ships eser as a Go binary. It forwards `eser laroux` to the `laroux` bin, `eser noskills` to the `noskills` bin and `eser posts` to a new `eser-posts` bin that ships before the launcher (M3-T13).
- The npm eser launcher depends on the Node noskills package until M4-T6, so `npx eser@latest noskills` hooks that v4.5.x already wrote into users' repos keep working.
- Release archives under the retired binary names carry small Go forwarding stubs (M3-T14). Installed v4.5.x laroux and noskills binaries, which run the old update.ts, self-update to a stub that runs the npm package instead of failing.
- M4 ports noskills, M5 the daemon and dashboard, and M6 moves the business logic that still exists only in TypeScript to Go behind the bridge, which stays.

The owner starts every release.

## Principles

- One cutover, no dual run: Deno is the runtime until M1 starts and is gone when M1 ends. Deno and Bun code paths that exist to run this repo are deleted, not guarded. The only Deno references that survive are the allowlist in ADR 0005: history files, plus code that supports users' own Deno projects if the owner keeps it.
- Do runtime-neutral work first: any fix that Deno and Node both accept lands in M0 under the green Deno gate, so the M1 red window holds only the toolchain switch and deletion.
- Codemods before hand edits: every change that repeats more than about 20 times is a script with fixture tests and a dry run whose counts must match the inventory. Each codemod is idempotent, applied in one mechanical commit, and carries a header naming the task that deletes it.
- One integration agent owns pnpm-lock.yaml and the root package.json from M0-T20 to the end of M2. Every dependency change, in any package, goes through that agent as a separate commit, and package tasks never edit the lockfile.
- Root-level code resolves packages only through root devDependencies. The root package.json lists exactly the tools and workspace packages that etc/scripts, etc/codemods and .agents scripts import, and nothing else. Checks that need a workspace package run from inside a package that declares it.
- Package-parallel by default: after M1 wave A, each task owns one package directory (or a listed set of tiny packages, committed one at a time) and the Go twin and doc files named in its description. Each agent works in its own worktree. Cross-package edits are named in the task and follow the workflow-practices protocol.
- The full gate is green at every milestone boundary. Only inside M1 may it be red, and only on the cutover branch, which the owner merges after `pnpm cli ok` passes on Node 26 with deno off PATH.
- No change on main may break a channel before a release changes what that channel serves. install.sh, install.ps1, the Homebrew and Nix steps and the updaters decide from the release's tag and archives, not from the merge date.
- Users who already rely on Deno-era artifacts get a working path or a readable message, never a silent dead end: JSR notices, forwarding stubs under the old archive names, launcher compatibility for `npx eser@latest noskills`, and a CHANGELOG Migration entry for every break.
- Go-only work never waits for the TypeScript cutover: the Go tracks (M3, M4, M5) depend on the M0 decisions, not on M1 or M2, except where they need a packed npm package.
- Node runs the TypeScript sources directly, so source code uses erasable syntax only: erasableSyntaxOnly and verbatimModuleSyntax in tsconfig, and no .tsx, enums, parameter properties, angle-bracket casts or decorator syntax in loaded code. Anything published to npm is emitted as JS plus .d.ts.
- Prefer, in this order: Web APIs that Node 26 has, then node:* built-ins, then vetted npm packages. A new dependency goes through tooling-standards vetting and owner approval.
- Go owns the binaries, the working parts and the business logic: CLIs, hooks, validators, release tooling, scaffolding and the daemon. Go domain logic lives in the pkg/ajan *fx packages, stays dependency-free behind small injected interfaces (hexagonal), and the cmd/ binaries are adapters that use those packages directly. TypeScript libraries keep their public API and types and delegate their logic to Go through the bridge; browser code, React and laroux client code, thin adapters and types stay in TypeScript.
- One FFI path: the bridge loads through node:ffi, behind a small dispatcher ABI, with blocking calls in worker threads. The WASM build is the only fallback, and if it cannot load either, the loader reports a clear error and exits. No other FFI backend is kept, koffi included. CI pins the exact Node minor and runs the FFI suites on every Node bump.
- Keep what installed users rely on: Rust-triple archive names, SHA256SUMS.txt and cosign signing never change, and JSR versions stay published and are not yanked.
- Docs change with the code they describe: each package task updates its own README and the docs and data files in its area, and the repo docs and skills change in the milestone that changes the commands.
- All TypeScript packages share one version from VERSION. The Go modules build from the shared tag and get no tags of their own. Never raise the code-conventions baseline; only shrink it.
- Agents never push, tag, publish or release, and never push to external repositories. Publishing is checked only with dry runs, external repo changes are handed to the owner as patches, and the owner starts every release.
- Everything written to the repo is in English, with no em dashes.

## Milestones

### M0 Decide and prepare (Deno gate green)

Record every decision, set up the root devDependencies and the integration-agent protocol, measure the risky assumptions, and land every runtime-neutral fix, the Go lint validator, the Makefile ajan build, the leaf test-kit and the tested codemods, all without changing the runtime, so the M1 red window is short and mechanical.

Exit criteria:

- ADR 0005 is accepted. It contains the Deno-reference allowlist and the root devDependencies policy, and every needsOwner decision in this plan has a recorded answer, so no M1 task waits on a decision
- `deno task cli ok` passes, and validate-circular-deps reports no cycle with @eserstack/test-kit as a devDependency of every package
- tsc 7 with erasableSyntaxOnly reports 0 TS1294 errors in packages; `git ls-files 'pkg/**/*.tsx'` is empty
- There is no Deno.bundle, Deno.serve or Deno.upgradeWebSocket in non-test library code, and repl-init.ts and pkg/@eserstack/mod.ts are deleted
- A CI job runs `node pkg/@eserstack/cli/main.ts ajan version` and two codebase validators through node:ffi, and it is green
- laroux build of a fixture works with ESER_AJAN=disabled
- The ajan native library and WASM build through make targets, and nothing in the tree (hints, READMEs, .gitignore, workflows, manifest) names ajan/scripts/build.ts
- The WASM fallback is the wasi profile reactor: at most 8 MB raw and 1.6 MB brotli, with no command mode, and a warm call costs under 0.1 ms of main-thread CPU
- No test file imports @std/assert or @std/testing/mock directly; all import @eserstack/test-kit
- The codemods pass their fixture tests under `node --test etc/codemods`, resolve oxc-parser from the root devDependencies, and their dry-run counts match the inventory
- The exact Node 26 minor (26.9 or later) that passed the M0-T2 spike and pnpm@11.18.0 are pinned through .node-version and packageManager in every CI job
- If the owner chose the last Deno-era release, it is prepared and the owner has released it before M1 starts

Tasks:

- TASK-174 (M0-T1): Record the decision to leave Deno, the Go/TS boundary and the Deno allowlist in ADR 0005
- TASK-175 (M0-T2): Measure the target toolchain assumptions in a scratch copy and write per-package hand-work lists
- TASK-176 (M0-T3): fp: replace angle-bracket type assertions with as casts
- TASK-177 (M0-T4): Remove non-erasable syntax from noskills, http and the di tests
- TASK-178 (M0-T5): logging: create the context store with node:async_hooks and drop parameter properties
- TASK-179 (M0-T6): laroux-react: remove .tsx so the package loads under Node
- TASK-180 (M0-T7): standards: add peer address, onListen and PermissionDeniedError to cross-runtime
- TASK-181 (M0-T8): laroux-server: serve through runtime.http, bundle dev with rolldown, drop .tsx
- TASK-182 (M0-T9): Make rolldown the only bundler and delete the Deno.bundle backend and the REPL entry
- TASK-183 (M0-T10): posts: run the OAuth callback server on runtime.http
- TASK-184 (M0-T11): collector: walk files with runtime.fs so laroux needs no native library
- TASK-187 (M0-T12): Remove Deno-only specifiers and pragmas from sources
- TASK-189 (M0-T13): Pin Node 26 and pnpm exactly, and run the eser CLI from source under Node in CI
- TASK-190 (M0-T14): Fix the npm bundle manifests for eser, noskills and laroux
- TASK-188 (M0-T15): Build the ajan native library and WASM with Makefile targets instead of Deno scripts
- TASK-191 (M0-T16): Enforce camelcase and tagged TODOs with a Go codebase validator that reads comments only
- TASK-186 (M0-T17): Add the leaf @eserstack/test-kit package and route every test to it
- TASK-192 (M0-T18): Write the Deno.test to node:test codemod
- TASK-193 (M0-T19): Write the lint-pragma and bench codemods
- TASK-185 (M0-T20): Start the integration-agent protocol and add the root devDependencies
- TASK-194 (M0-T21): Prepare a last Deno-era release with JSR and updater migration notices
- TASK-272 (M0-T22): ajan: shrink the WASM build to the wasi profile
- TASK-273 (M0-T23): ajan: serve the WASM fallback through one reused reactor instance and delete command mode
- TASK-274 (M0-T24): codebasefx and collectorfx: report an error for a walk root that cannot be read
- TASK-275 (M0-T25): Replace jsonschema/v6 with a fork that compiles the metaschemas lazily
- TASK-276 (M0-T26): Limit the nesting depth of JSON and YAML input before the bridge decodes it
- TASK-280: laroux-server: run the proxy chain of the requested path for GET /rsc (interim, track L)
- TASK-281: laroux-server: escape comment and script openers in the inline payload of the await-all shell (interim, track L)

### M1 Cutover to Node, pnpm, oxlint, oxfmt and tsc 7; delete Deno and Bun

Move every package, test, script, CI job, recipe, skill and doc to the new toolchain in one milestone that agents run in parallel, then delete everything Deno- and Bun-specific and stop it from coming back, without breaking any install channel at merge time.

Exit criteria:

- `pnpm cli ok` passes on Node 26 on a machine with no deno on PATH: Go validators, oxfmt --check, oxlint, tsc --noEmit, node --test with LCOV coverage, and the Go check, lint and test
- `pnpm cli preflight` passes, apart from steps the binaries decision removed on purpose
- These are deleted: deno.json, every deno.extra.json, gen-jsr-manifests.ts, the Deno and Bun cross-runtime adapters and invokers, the Deno and Bun FFI backends, the deno compile path and etc/codemods
- validate-runtime-js-apis (TS and Go) reports every Deno and Bun identifier reference in code, including globalThis.Deno, aliased globals and test files, with no excludes
- `git grep -wi deno` and `git grep -wi bun` match only the allowlist recorded in ADR 0005
- No workflow uses setup-deno, and CI is green on the cutover branch
- Against the v4.5.2 release, install.sh and install.ps1 still install eser, noskills, laroux and noskills-server
- AGENTS.md, docs/agents, the skills, the recipes and every package README describe only the new toolchain; git hooks are reinstalled and run `pnpm cli ok`
- The owner has merged the cutover branch

Tasks:

- TASK-195 (M1-T1): Add the Node toolchain configuration, editor and agent settings, and open the cutover branch
- TASK-196 (M1-T2): Format the repository with oxfmt in one commit before worktrees branch
- TASK-197 (M1-T3): Apply the lint-pragma codemod repo-wide
- TASK-198 (M1-T4): Apply the test and bench codemods repo-wide
- TASK-199 (M1-T5): Start the eser CLI with node
- TASK-200 (M1-T6): Define the precommit and preflight workflows on the new toolchain
- TASK-201 (M1-T7): standards: make cross-runtime Node-only and synchronous
- TASK-202 (M1-T8): ajan: run the FFI bridge on Node only through node:ffi
- TASK-203 (M1-T9): codebase: remove Deno and Bun from the system handlers and release tooling
- TASK-204 (M1-T10): codebase: ban Deno and Bun identifiers in the validators and clean the Go codebasefx twin
- TASK-205 (M1-T11): cli: remove deno compile and run the npm build under node
- TASK-206 (M1-T12): bundler: pass tests on Node
- TASK-207 (M1-T13): laroux-bundler: resolve through node_modules and pass tests on Node
- TASK-208 (M1-T14): laroux-server: pass tests on Node
- TASK-209 (M1-T15): laroux and laroux-react: pass tests on Node
- TASK-210 (M1-T16): Remove @eserstack/jsx-runtime and @eserstack/laroux-runtime
- TASK-211 (M1-T17): noskills: pass the 72 test files on Node and stop generating deno commands
- TASK-212 (M1-T18): noskills-web: pass tests on Node
- TASK-213 (M1-T19): mux, noskills-server-worker and the daemon worker runtime search
- TASK-214 (M1-T20): posts: pass tests on Node and move its deno tasks to package.json
- TASK-215 (M1-T21): shell: pass tests on Node
- TASK-216 (M1-T22): kit and cs: pass tests on Node and remove the JSR recipe provider
- TASK-217 (M1-T23): ai: pass tests on Node
- TASK-218 (M1-T24): httpclient and logging: pass tests on Node
- TASK-219 (M1-T25): cache, config, crypto, formats, parsing and collector: pass tests on Node
- TASK-220 (M1-T26): fp: pass tests and benches on Node
- TASK-221 (M1-T27): workflows: pass tests on Node
- TASK-222 (M1-T28): http, primitives, functions, streams and events: pass tests on Node
- TASK-223 (M1-T29): di, testing, test-kit, agents, app-runtime, noskills-client and webtransport: pass tests on Node
- TASK-224 (M1-T30): etc/scripts: port the release helpers to node and delete the JSR generator
- TASK-225 (M1-T31): CI: move the validation jobs to Node and cover npm and the bridge module in Dependabot
- TASK-226 (M1-T32): CI release jobs and install channels that decide from the release, not the merge
- TASK-227 (M1-T33): Recipes: move every remaining recipe and the library template to Node
- TASK-228 (M1-T34): Skills, part one: tooling, JavaScript and testing rules
- TASK-229 (M1-T35): Skills, part two: release, coding, workflow, security, docs and frontend rules
- TASK-230 (M1-T36): Repo docs and the CHANGELOG migration entry
- TASK-231 (M1-T37): Close the cutover: delete what is left of Deno and Bun and turn the gate green

### M2 Releasable on Node

Make the new toolchain publishable and safe: no JSR-hosted dependencies, npm library emit, real laroux packaging, the test-kit on node:assert, a small dispatcher ABI for the Go bridge with blocking calls in worker threads so the event loop stays free, and prepared patches for the external template and tap repos.

Exit criteria:

- No @std/* or @jsr/* dependency in any package.json, and .npmrc has no @jsr line
- Preflight packs every library, installs all tarballs together into a scratch Node 26 project with overrides for the workspace ranges, and imports every export entry
- `laroux dev`, `laroux build` and `laroux serve` pass a CI smoke test from the packed npm package, with one React copy and one action registry
- pkg/@eserstack/ajan/main.go exports only EserAjanVersion, EserAjanCall, EserAjanStreamOpen, EserAjanStreamRead, EserAjanStreamClose and EserAjanFree, and the parity test matches the TS binding table against the Go registry
- Regression tests show that 8 concurrent blocking calls keep timers and fs responsive, that an unrelated fs read stays under 100 ms with 4 PTY panes and an AI stream open, that an AbortSignal cancels in-flight AI and HTTP stream calls, and that 50 teardown runs with live workers exit cleanly
- CI runs the FFI suites and the worker tests on the pinned Node minor and on every change to it
- The patches for the laroux template repos and the homebrew-tap are with the owner
- CHANGELOG Unreleased, Migration lists every consumer-facing break, and the owner has the release checklist

Tasks:

- TASK-232 (M2-T1): Emit JS and declarations for every published library
- TASK-233 (M2-T2): Replace @std utility modules with node built-ins
- TASK-234 (M2-T3): Replace the @std parsers and @eemeli/yaml with vetted npm packages
- TASK-235 (M2-T4): Reimplement test-kit on node:assert and node:test, and drop the JSR registry
- TASK-236 (M2-T5): Publish the libraries to npm from CI and verify them in preflight
- TASK-237 (M2-T6): laroux: ship a real npm package and smoke-test dev, build and serve on Node
- TASK-238 (M2-T7): ajan: replace the 100 FFI exports with a dispatcher ABI and one TS binding table
- TASK-239 (M2-T8): ajan: run blocking FFI calls in worker threads with responsiveness, cancellation and teardown tests
- TASK-241 (M2-T9): Prepare the first release after the cutover for the owner
- TASK-240 (M2-T10): Prepare patches for the laroux template repos and the homebrew-tap
- TASK-277 (M2-T11): ajan: run httpclient on the WASM fallback through a host fetch import
- TASK-278 (M2-T12): logfx: make OpenTelemetry optional and add logging to the WASM profile

### M3 eser as a Go binary; gate and release tooling in Go

Ship cmd/eser in Go. It runs the manifest workflows and every validator, owns release and version tooling plus kit, cs and ai, and forwards laroux, noskills and posts to bins that exist. The eser binary channels come back, and installed v4.5.x eser, laroux and noskills binaries can update to something that works.

Exit criteria:

- `eser ok` (Go) runs the precommit workflow, and the git hooks and CI validate job use it; `make ok` passes
- Release, rerelease, unrelease, versions, changelog, release-notes, release-tag and gh contributors run in Go
- cli/scripts/compile.ts and the node updater scripts are deleted; Go builds the archives, the forwarding stubs, SHA256SUMS.txt and the Homebrew and Nix outputs
- Preflight proves that v4.5.2-named eser, laroux and noskills archives self-update to the Go eser binary or to the forwarding stubs
- `eser laroux --help`, `eser noskills --help`, `eser posts --help` and `npx eser@<packed> noskills --help` work from the packed packages
- install.sh, install.ps1, Homebrew, Nix and the npm launcher install eser
- The TypeScript eser dispatcher, codebase CLI layer, TS workflows engine and the kit and cs twins are deleted; the gate is green

Tasks:

- TASK-242 (M3-T1): Add a CLI support package with prompt primitives to pkg/ajan
- TASK-243 (M3-T2): Load .eser/manifest.yml in Go
- TASK-244 (M3-T3): Close the workflowfx parity gaps listed in workflows/WIRING.md
- TASK-245 (M3-T4): Create cmd/eser with scripts, plugin forwarding and system commands
- TASK-246 (M3-T5): Port validate-code-conventions and its baseline to Go codebasefx
- TASK-247 (M3-T6): Port the remaining TS-only validators to Go and verify the existing Go ones
- TASK-248 (M3-T7): Make the Go eser the gate runner
- TASK-249 (M3-T8): Move the release commands to Go
- TASK-250 (M3-T9): Move kit, cs and ai subcommands to Go
- TASK-251 (M3-T10): Build release artifacts, Homebrew and Nix outputs in Go
- TASK-254 (M3-T11): Ship the eser Go binary through every channel, keeping npx noskills hooks working
- TASK-255 (M3-T12): Delete the TypeScript eser dispatcher and the twins now in Go
- TASK-252 (M3-T13): Give posts a standalone eser-posts npm bin
- TASK-253 (M3-T14): Build forwarding stub binaries for the retired laroux and noskills archive names

### M4 noskills as a Go binary

Make pkg/ajan/noskillsfx the only noskills implementation behind a static Go binary that hooks call in milliseconds, and delete the TypeScript twin.

Exit criteria:

- cmd/noskills builds for the five release targets with CGO_ENABLED=0 and passes the golden harness recorded from the TS implementation
- Generated agent hooks call the local noskills binary, with no npx or node on the hook path, and existing `npx eser@latest noskills` hooks still work
- noskills ships through every channel with Rust-triple names, replacing the forwarding stub, and a v4.5.2-named noskills archive self-updates in preflight
- The migrated TS noskills code is deleted and the gate is green

Tasks:

- TASK-256 (M4-T1): Diff TS noskills against noskillsfx and build a golden harness
- TASK-257 (M4-T2): Create cmd/noskills and port the hook path to Go
- TASK-258 (M4-T3): Move the noskills spec lifecycle commands to Go
- TASK-259 (M4-T4): Move the noskills state commands and sync adapters to Go
- TASK-260 (M4-T5): Move `noskills run` to Go on aifx and acpfx
- TASK-261 (M4-T6): Ship noskills as a Go binary through every channel
- TASK-262 (M4-T7): Delete the TypeScript noskills twin

### M5 Daemon and dashboard without a JS runtime

noskills-server runs mux sessions in Go and serves the dashboard from embedded templates, so the daemon ships with no TypeScript.

Exit criteria:

- noskills-server runs mux sessions with no node, bun or deno on PATH (CI job)
- Dashboard pages, SSE and the /mux WebSocket are served by noskillsserverfx
- noskills-server-worker, mux, noskills-web and the remaining TS noskills modules are deleted; the gate is green

Tasks:

- TASK-263 (M5-T1): Build muxfx in Go on shellfx/pty
- TASK-264 (M5-T2): Run mux sessions inside noskills-server and delete the TS worker
- TASK-265 (M5-T3): Serve the noskills dashboard from noskillsserverfx
- TASK-266 (M5-T4): Move `noskills manager` and `noskills web` to Go and delete the TS packages

### M6 Remaining business logic moves to Go behind the bridge

Move the business logic that still exists only in TypeScript to the matching pkg/ajan *fx package, package by package, and have the TypeScript libraries reach it through the bridge. The libraries keep their public API and types; browser code, React and laroux client code, thin adapters and types stay in TypeScript. shell and ai keep their Go paths. The bridge, its platform packages, the WASM fallback (decision-45) and the second Go module stay.

Exit criteria:

- Every package that depends on @eserstack/ajan has a WIRING.md audit table that marks each export as Go, moved or TS, with a reason on every TS row and a list of kept fallbacks
- Every function moved to Go has a Go test in its *fx package and a TS test that reaches it through EserAjanCall on shared fixtures
- The WASM fallback is built and tested in CI on every release, and each name it cannot serve returns UNSUPPORTED_IN_WASM (decision-45)
- go.mod and pkg/@eserstack/ajan/go.mod both remain, and the gate lints and tests both Go modules
- The cross-runtime facade decision is applied and recorded; docs and skills describe the final Go/TS boundary; the gate is green

Tasks:

- TASK-267 (M6-T1): Move the leaf libraries' remaining TypeScript logic to Go behind the bridge
- TASK-268 (M6-T2): shell and ai: keep the Go paths and move their remaining TypeScript logic to Go
- TASK-269 (M6-T3): Move the codebase, workflows, kit, cs and posts library logic to Go behind the bridge and keep the WASM fallback under CI
- TASK-270 (M6-T4): Decide and apply the future of the cross-runtime facade
- TASK-279 (M6-T5): aifx: implement the providers on net/http and drop the vendor SDKs

### Track L laroux R1 (m-7), after M2 and in parallel with M3 to M6

doc-3 is the design and doc-2 the background. Two interim fixes to the shipping pipeline land in M0 (TASK-280, TASK-281, next to TASK-271). Spikes TASK-282 to TASK-288 gate the implementation tasks, TASK-289 writes ADRs 0006 to 0008, and TASK-290 to TASK-317 build R1 one package per task, and TASK-318 runs the ajan reactor on workerd. The track ends with the old pipeline's deletion in 6.0.0, right after the R1 minor (decision-58).

Exit criteria: see milestone m-7.

Tasks: TASK-280 to TASK-318, listed in doc-3 section 26. The owner answered doc-3's five open questions on 2026-10-24 (decision-57 to decision-60, and decision-45 and decision-52 amended).

## Decisions

Decisions marked proposed wait for the owner; recommended ones are planner defaults the owner may override.

- decision-1 (owner): How agents commit and coordinate, from M0 on and while the gate is red inside M1
- decision-2 (owner): What the root package.json may carry
- decision-3 (owner): Where the assertion and mock seam lives
- decision-4 (owner): Keep the Deno standard library (@std via JSR) through M1, or remove it during the cutover
- decision-5 (owner): Keep publishing to JSR or move the libraries to npm only
- decision-6 (owner): Give JSR consumers a signal before freezing it
- decision-7 (owner): Test runner and assertion library
- decision-8 (owner): What replaces deno compile for the eser, noskills and laroux binaries
- decision-9 (owner): What installed v4.5.x laroux and noskills binaries update to
- decision-10 (owner): How existing `npx eser@latest noskills` hooks keep working
- decision-11 (owner): When install.sh and install.ps1 stop offering eser, noskills and laroux
- decision-12 (owner): Keep supporting users whose own projects use Deno
- decision-13 (owner): When the first release after the cutover happens
- decision-14 (owner): Minimum Node.js version
- decision-15 (owner): Keep Bun support
- decision-16 (owner): Keep the @eserstack/standards runtime facade
- decision-17 (owner): How laroux-react's JSX runs under Node
- decision-18 (owner): Remove @eserstack/jsx-runtime and @eserstack/laroux-runtime
- decision-19 (owner): oxfmt settings and the one-time reformat
- decision-20 (owner): The documented command form for the gate and scripts
- decision-21 (owner): Required TODO tag form and what the validator reads
- decision-22 (owner): Where the Go and TypeScript boundary sits
- decision-23 (owner): How the laroux template repos and the homebrew-tap migrate
- decision-24 (planner): When the gate runner moves to Go
- decision-25 (owner): noskills as its own binary or as part of noskills-server
- decision-26 (owner): Go dependencies for the CLI framework and prompts
- decision-27 (owner): VT screen model for the Go mux
- decision-28 (owner): posts in Go or as a Node plugin
- decision-29 (owner): Version of the first release after the cutover
- decision-30 (owner): Replacements for the JSR-hosted runtime dependencies
- decision-31 (owner): Long-term shape of the laroux server
- decision-32 (planner): Home of the validators that inspect TypeScript source
- decision-33 (planner): Type checker and emitter
- decision-34 (planner): Rules oxlint does not cover
- decision-35 (planner): Parser for the codemods
- decision-36 (planner): Replacement for Deno.bench
- decision-37 (owner): FFI mechanism on Node
- decision-38 (planner): Release archive names
- decision-39 (planner): Tool for the Go release builds
- decision-40 (planner): How the ajan native and WASM libraries are built
- decision-41 (planner): pnpm version pin
- decision-42 (planner): @eserstack/di decorator API
- decision-43 (planner): Replacement for deno doc --html and --lint
- decision-44 (planner): The permissions rule in workflow-practices
- decision-45 (owner): ajan WASM fallback
- decision-46 (owner): laroux package layout
- decision-47 (owner): How laroux apps import laroux from npm
- decision-48 (owner): Vite and webpack in laroux apps
- decision-49 (owner): srvx in TanStack Start apps (superseded by decision-53)
- decision-50 (owner): laroux keeps its own framework
- decision-51 (owner): HMR and Fast Refresh in the first release
- decision-52 (owner): laroux deploy targets
- decision-53 (owner): No TanStack Start adapter
- decision-54 (owner): Scope of the first laroux release
- decision-55 (owner): aifx providers on net/http
- decision-56 (owner): jsonschema/v6 fork
- decision-57 (owner): laroux browser test driver
- decision-58 (owner): Versioning of the laroux switch
- decision-59 (owner): React and rsdw version range
- decision-60 (owner): Unsafe requests without Origin or Fetch Metadata

## Risks

- The node:ffi path has never run in the gate. M0-T2 measures it and M0-T13 runs the CLI from source under Node in CI before the cutover, but the 7 FFI test suites first run on node:ffi inside M1-T8. Every wave B task with FFI-backed tests now depends on M1-T8, so a node:ffi failure stalls those tasks instead of being chased twice.
- node:ffi is experimental (Stability 1), and a breaking minor would leave only the WASM fallback, which serves the 44 names of the wasi profile (decision-45), with network only after TASK-277. Mitigations: the M0-T2 spike measures the design before M1 and decision-37 records the result, .node-version and CI pin the exact Node minor, and every Node bump must pass the FFI suites and worker tests (M2-T8).
- The M1 red window depends on the owner's red-window-commits answer. Without it, agents either stall or skip hooks.
- About 30 parallel agents touch shared files. Mitigations: the integration agent owns the lockfile and the root package.json from M0-T20, wave A is strictly sequential, and every wave B task waits for the reformat and both codemod commits.
- The root devDependencies policy can drift as convenience imports creep in. Mitigation: the list is in the ADR 0005 appendix, and only the integration agent edits the root package.json.
- oxfmt is 0.x and its Markdown and YAML output is unverified. Pin the exact version and review the M0-T2 diff before adopting it.
- tsc 7 checks the whole tree, including tests that deno check never type-checked. M0-T2 records the error count per package so each wave B task knows its share, but a large count can stretch M1.
- Deno's op and resource sanitizers and --trace-leaks are lost. A leaked handle shows up only as a test file that never exits. The test-kit leak check (M1-T29) and per-file timeouts cover part of this; never use --test-force-exit.
- node --test isolates each file in its own process. The gate gets slower, and every FFI test file pays a cold library load of 280 to 725 ms.
- node:ffi calls are synchronous, so a blocking call on the main thread freezes the event loop until M2-T8 moves blocking calls to worker threads. Heavy mux, manager and AI use on Node should wait for M2-T8.
- The Deno allowlist for user-project support can hide real leftovers. Mitigation: the validator bans Deno and Bun identifiers in code regardless of path, and the grep allowlist lists files by path, not by pattern.
- The forwarding stubs replace a working laroux or noskills binary with one that needs node and npx at run time. Users with no Node installation get the npm message instead of a working command. The Migration entry says so.
- The eser npm launcher's Node noskills dependency grows the install until M4-T6, and a launcher version that mismatches the noskills package could forward to the wrong behavior. Pin noskills exactly to the shared version.
- Between the cutover merge and the first release, main and the latest release describe different toolchains. install.sh decides from the release, but README install lines on main already describe npm. M1-T36 keeps the binary install instructions until the release lands.
- JSR consumers are stranded on 4.5.x if JSR is frozen; the 4.5.3 notice depends on the owner releasing it before M1. New npm names need a manual bootstrap publish and trusted-publisher setup by the owner before CI can publish them.
- The laroux npm bundle may split the action-registry singleton and the React copy until M2-T6 replaces it. Only `--help` is smoke-tested today.
- The external template repos and the homebrew-tap change only when the owner applies the M2-T10 patches. Until then, `laroux init` scaffolds Deno-era templates.
- Go c-shared inside Node is untested for the teardown SIGSEGV seen under Deno, and for contention between Go and Node over stdin, raw mode and SIGWINCH. M0-T2 measures both and M2-T8 tests them.
- The Go ports can drift from TS behavior: compiler.ts is 3,405 lines against 849 in compiler.go. Golden tests and output comparisons are required before any TS twin is deleted, and Go tracks that start during M1 compare against the post-M1 TS output.
- If the Go gate runner (M3-T7) misses step order, fix commands or timeouts, failures can be hidden. The dry-run comparison in M3-T3 guards against this.
- TypeScript 7 has no programmatic API until 7.1. Any tool that imports `typescript` must pin @typescript/typescript6.
- @std assertEquals and node deepStrictEqual differ on prototypes. test-kit keeps that out of the cutover, but it surfaces in M2-T4 as an unknown number of failures.
- Deno runtime support ends about October 2027. A stalled cutover leaves the repo on an unmaintained runtime, so M0 is front-loaded and M1 should take days to weeks, not months.

## Kept during the transition

- The @eserstack/standards runtime facade with the Node adapter (plus the browser entry laroux maps), so the 318 importing files do not change; revisited in M6-T4
- The private leaf @eserstack/test-kit re-exporting @std/assert and @std/testing/mock (from npm.jsr.io) until M2-T4 reimplements it on node:assert; per decision std-during-cutover
- The root .npmrc @jsr registry line until M2-T4 removes the last @jsr dependency
- The runtime @std modules until M2-T2 and M2-T3, before any npm pack or publish
- oxc-parser as a root devDependency while etc/codemods exists, removed in M1-T37
- The FFI bridge (pkg/@eserstack/ajan on node:ffi), the c-shared library, the ajan-* platform packages and the bridge's Go module, permanently, with the WASM fallback (decision-45)
- Synchronous node:ffi calls on the existing 100 exports through M1; the dispatcher arrives in M2-T7 and worker threads for blocking calls in M2-T8
- The TS eser CLI on Node as the gate runner during M1 and M2, until the Go eser takes over in M3-T7
- The TS noskills CLI on Node and its npm package until the Go binary ships in M4-T6
- The Node noskills package as a dependency of the npm eser launcher, so `npx eser@latest noskills` hooks keep working, until M4-T6
- The `npx eser@latest noskills` default hook command until M4-T2 generates hooks for the Go binary
- The TS mux worker on Node behind noskills-server until M5-T2, with NOSKILLS_WORKER_RUNTIME=deno or bun falling back to node
- The esbuild npm bundles for eser and noskills until they become launchers for the Go binaries
- Small node ports of update-homebrew-formula.ts and update-nix-hashes.ts until M3-T10 replaces them in Go
- The last released eser, noskills and laroux archives and hashes in Homebrew, Nix and install.sh until a release provides new ones
- Forwarding stub archives under the laroux name (and the noskills name until M4-T6), in every release until the owner retires them
- Rust-triple archive names, SHA256SUMS.txt, cosign signing and the release-gate checks, permanently
- npm OIDC trusted publishing with provenance for the bundles and platform packages
- The eser-<name> PATH plugin convention plus the known-bin table (laroux, noskills, eser-posts), used by the Go eser to forward to Node CLIs
- RTLD_NODELETE image pinning in pin_image_posix.go and pin_image_windows.go, permanently, since workers open the library with their own dlopen
- JSR packages published at 4.5.x (and 4.5.3 if released), not yanked
- Support for users' own Deno projects in noskills and kitfx, if decision user-deno-projects keeps it, listed in the ADR 0005 allowlist
- laroux on Node with rolldown, lightningcss, Tailwind and sharp, permanently
- The noskills-server Go binary and its install channels throughout
- CHANGELOG.md history, ADRs 0001 to 0004 as written, the backlog history and security-report.md as a dated report, all on the ADR 0005 allowlist
