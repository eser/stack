# Leave Deno for Node and Go

## Status

Accepted. The owner accepted the decisions this ADR records on 2026-10-15, and
the later ones on 2026-10-23 and 2026-10-24 (Appendix A).

ADR 0004 is superseded in part: its server-bundler and Deno resolution sections
no longer apply, and its bare-specifier rule stays.

## Context and Problem Statement

The repository runs on Deno: `deno task cli ok` is the gate, the binaries are
built with `deno compile`, the libraries publish to JSR, and the TypeScript
packages call Go through the ajan FFI bridge on `Deno.dlopen`.

On 2026-10-09 Deno's maintainers announced (deno.com/blog/cloudflare) that Deno
gets one more year of monthly bug-fix releases and then development ends. There
will be no Deno 3. Deno Deploy shuts down in six months. JSR keeps operating on
Cloudflare.

The question is what the repository runs on after Deno, which language owns
which part, and how to get there without breaking the users of the published
libraries, the installed binaries and the `npx eser@latest noskills` hooks that
are already in users' repositories.

## Decision Drivers

- No dependency on a runtime whose development ends in about a year.
- One implementation of each piece of business logic.
- Installed binaries, published packages and existing hooks keep working
  through the switch.
- A gate that stays enforceable during the switch, with about 30 agents
  working in parallel.
- No new runtime dependency where the platform already has one.

## Considered Options

- **Stay on Deno until its last release.** No migration cost now, but the
  repository then moves under time pressure, and Deno Deploy users lose their
  host in six months regardless.
- **Move to Bun.** Fast and Deno-like, but a second runtime to support for a
  smaller user base, and the bridge, the CI matrix and the adapters would carry
  two non-Node backends.
- **Move to Node 26 with pnpm, oxlint, oxfmt, tsc 7 and node:test, and let Go
  own the binaries, the working parts and the business logic.** The largest
  one-time cost, and the only option where every tool and every runtime path
  has a long-lived owner.

## Decision Outcome

The third option, in one cutover (milestone M1) with preparation in M0.

- **Runtime and tools:** Node `>=26.9` (decision-14), pnpm 11.18.0
  (decision-41), oxlint, oxfmt, tsc 7 `--noEmit` with a separate build config
  (decision-33) and node:test behind the private `@eserstack/test-kit` seam
  (decision-3, decision-7). Bun is dropped with Deno (decision-15).
- **Go owns** the binaries (eser, noskills, noskills-server), the working parts
  (CLIs, hooks, validators, release tooling, scaffolding, the daemon) and the
  business logic (decision-22). Go domain code lives in the `pkg/ajan` `*fx`
  packages; `pkg/ajan/api/business` is empty and is not where it goes.
- **TypeScript libraries** keep their public API and types and delegate their
  logic to Go through the bridge. Browser code, React and laroux client code,
  thin adapters and types stay in TypeScript. M6 moves the logic that exists
  only in TypeScript, package by package.
- **The bridge stays** and becomes the main way TypeScript reaches Go. It loads
  through node:ffi first; when node:ffi cannot load, it uses the WASM build
  (WASI); otherwise it reports a clear error and exits. koffi is removed
  (decision-37). The WASM build is one slim reactor of the wasi profile, run on
  Node and on Cloudflare Workers (decision-45). The bridge's Go module stays, so
  the repository keeps two `go.mod` files.
- **Publishing:** JSR is frozen at the last 4.5.x after a 4.5.3 notice release,
  and the libraries publish to npm only (decision-5, decision-6). The first
  release after the cutover is 5.0.0 with a complete CHANGELOG Migration
  section (decision-29), held until M3-T11 so binary users keep self-update
  (decision-13).
- **Users' own Deno projects stay supported:** noskills and kit keep
  recognizing them (decision-12); Appendix B lists those files.

Appendix A records the owner's answer to every decision of the plan. The plan
itself is backlog doc-1, with milestones m-0 to m-7 in `backlog/milestones/`.

## Consequences

Easier:

- One runtime and one package manager in CI, in the gate and in the docs.
- Business logic has one implementation in Go, reachable from the binaries
  directly and from TypeScript through the bridge.
- The bridge has one ABI (a dispatcher) for node:ffi and for the WASM reactor.

Harder:

- node:ffi is experimental. CI pins the exact Node minor and runs the FFI
  suites on every Node bump; the WASM reactor serves only its profile's names
  when node:ffi breaks.
- The cutover makes the gate red inside M1. The integration-agent protocol
  (Appendix D) and a cutover branch with owner-disabled hooks keep the work
  orderly until M1-T37 turns it green.
- JSR consumers stay on 4.5.x unless they move to npm.
- Two laroux pipelines exist for one 5.x minor while track L lands
  (decision-58).

## Links

- backlog/docs/doc-1: the plan overview and key map
- backlog/decisions: decision-1 to decision-60
- ADR 0004: bundler external import specifiers (superseded in part)

## Appendix A: Owner decisions

All accepted. decision-1 to decision-44 on 2026-10-15; decision-45 on
2026-10-15 and amended on 2026-10-24; decision-46 to decision-54 on 2026-10-23;
decision-55 to decision-60 on 2026-10-24.

| Decision | Answer |
| --- | --- |
| 1 red-window-commits | Integration agent from M0-T20; M1 on a cutover branch with owner-disabled hooks and a worktree per agent; the owner merges after a green `pnpm cli ok` with deno off PATH |
| 2 root-devdeps | An explicit allow list for the root package.json (Appendix C) |
| 3 seam-location | The private leaf package `@eserstack/test-kit` |
| 4 std-during-cutover | Keep @std through M1, remove it in M2 before the first release |
| 5 jsr-publishing | Freeze JSR at 4.5.x and publish to npm only |
| 6 jsr-deprecation-notice | A 4.5.3 release with the notice (M0-T21) |
| 7 test-stack | node:test with the test-kit seam |
| 8 binaries | Go binaries for eser and noskills; laroux on npm only, with no SEA |
| 9 legacy-binary-updates | Go forwarding stubs under the old archive names, plus the 4.5.3 updater; the owner retires them |
| 10 npx-noskills-hooks | The launcher dependency with ESER_PLUGIN_PATH, replaced by the Go launcher after M4-T6 |
| 11 install-script-fallback | install.sh and install.ps1 decide from the release's archives |
| 12 user-deno-projects | Keep support for users' Deno projects and allowlist those files (Appendix B) |
| 13 first-release-timing | Hold the first release until M3-T11 |
| 14 node-floor | `>=26.9`; CI pins the exact minor that passed M0-T2 |
| 15 bun-support | Drop Bun in M1 |
| 16 cross-runtime-facade | Keep the facade Node-only; decide on collapsing it in M6-T4 |
| 17 jsx-approach | Rewrite laroux-react's JSX with React.createElement in M0 |
| 18 legacy-packages | Delete @eserstack/jsx-runtime and @eserstack/laroux-runtime in M1 |
| 19 formatter-settings | One oxfmt reformat commit first in M1, printWidth 80, exact pin |
| 20 command-form | `pnpm cli <script>` in M1, `eser ok` from M3-T7 |
| 21 todo-tag-form | `TODO(TASK-<number>)` in comments only |
| 22 go-ts-boundary | Go owns binaries, working parts and business logic; TypeScript delegates through the bridge; no sidecar |
| 23 external-repos | Template repos and the homebrew tap get patches the owner applies |
| 24 gate-runner | The TS CLI on Node runs the gate in M1; the Go runner takes over in M3-T7 |
| 25 noskills-binary-layout | A separate cmd/noskills with its own archive |
| 26 go-cli-deps | An in-house clifx plus one vetted prompt dependency |
| 27 vt-emulator | Vet a Go VT dependency in M5-T1; build in-house only if none passes |
| 28 posts-future | posts stays in Node with an `eser-posts` bin; revisit after M6 |
| 29 release-version | 5.0.0 |
| 30 std-deps | Replace the JSR-hosted runtime dependencies in M2 |
| 31 laroux-server-future | Node only for now |
| 32 ast-validators | Port the TypeScript-source validators to Go on the M0-T16 lexer |
| 33 type-checker | tsc 7 `--noEmit` in the gate, tsconfig.build.json for emit |
| 34 lint-gaps | The Go validator from M0-T16; delete the Deno lint plugin |
| 35 codemod-parser | oxc-parser as a root devDependency |
| 36 benches | mitata through the bench codemod |
| 37 ffi-on-node | node:ffi, then the WASM build, then a clear error; koffi removed; a dispatcher ABI and worker threads for blocking calls |
| 38 archive-naming | Keep the Rust triples in archive names permanently |
| 39 release-build-tool | `eser dev compile` |
| 40 ajan-build-tool | Makefile targets for the native and WASM libraries |
| 41 pnpm-version | `pnpm@11.18.0` |
| 42 di-decorators | Keep the decorator API and document the transform requirement |
| 43 docs-api | Drop the HTML API docs |
| 44 deno-permission-rule | Drop the rule from workflow-practices |
| 45 wasm-fallback | One slim wasi-profile reactor, on Node and Cloudflare Workers; command mode deleted; 10 ms budget per call; fs preopen; optional OTel; early host fetch import |
| 46 laroux-package-layout | Three packages: laroux, laroux-server, bundler |
| 47 laroux-npm-imports | Apps import `@eserstack/laroux` from npm; `laroux` is the tool |
| 48 laroux-vite-optional | Vite and webpack are optional; Flight runtime and transforms as dependencies |
| 49 laroux-srvx | Superseded by decision-53 |
| 50 laroux-native-kept | laroux keeps its own framework |
| 51 laroux-hmr-day-one | HMR and Fast Refresh in the first release |
| 52 laroux-deploy-targets | Node and Cloudflare Workers from the first release |
| 53 laroux-no-start-adapter | No TanStack Start adapter |
| 54 laroux-r1-scope | R1 adds server islands, partial prerendering, the env split, onRequestError, sessions, i18n routing and composable handlers |
| 55 aifx-net-http | aifx providers on net/http; the vendor SDKs leave |
| 56 jsonschema-fork | An in-tree fork of jsonschema/v6 with no upstream PR |
| 57 laroux-browser-driver | Playwright |
| 58 laroux-versioning | Additive in 5.x; the old laroux pipeline is deleted in 6.0.0 right after R1 |
| 59 laroux-react-range | A tilde range on the newest stable React, kept current |
| 60 laroux-headerless | Unsafe requests without Origin or Fetch Metadata get 403 unless an action opts in |

## Appendix B: Deno and Bun reference allowlist

After M1, `git grep -wi deno` and `git grep -wi bun` must return only these
paths, each for the reason given (M1-T37 audits against this list):

| Path | Reason |
| --- | --- |
| `CHANGELOG.md` | Release history |
| `docs/adr/0001-*.md` to `docs/adr/0004-*.md` and this ADR | Decision history |
| `backlog/` | Task and decision history |
| Validator patterns in `pkg/@eserstack/codebase/` and `pkg/ajan/codebasefx/` | They name `Deno.*` and `Bun.*` APIs in order to ban them |
| `pkg/@eserstack/noskills/detect/codebase.ts` | Detects users' Deno projects (decision-12) |
| `pkg/@eserstack/noskills/sync/hook-commands.ts` | Recognizes `deno run` and `deno x` as network commands in users' hooks |
| `pkg/@eserstack/noskills/defaults/concerns/*.json` | Default concern texts that mention Deno projects |
| `pkg/ajan/kitfx/deps.go`, `pkg/ajan/kitfx/types.go` | ProjectTypeDeno and its `deno add` hints for users' projects |
| `pkg/ajan/codebasefx/workspace*.go` and its tests | Reads `deno.json` in users' repositories |

Any other match is fixed, or added here with a reason in the same change.
decision-12 is revisited when Deno support ends, about October 2027.

## Appendix C: Root devDependencies policy

The root `package.json` may carry only:

- the toolchain: typescript, oxlint, oxlint-tsgolint, oxfmt, mitata and
  @types/node;
- oxc-parser while the codemods exist;
- `@eserstack/test-kit` as `workspace:*`;
- Playwright for the laroux real-browser tests (decision-57).

Each is pinned exactly and vetted under tooling-standards. Anything else needs
the owner's approval and an entry here. A check that needs another workspace
package runs from inside a package that declares it.

## Appendix D: Integration-agent protocol

- From M0-T20 to the end of M2, one named integration agent alone edits
  `pnpm-lock.yaml` and the root `package.json`, and lands every `package.json`
  dependency change, one commit per batch. Other agents send it their
  dependency requests.
- In M1 the work happens on a cutover branch on which the owner disables the
  hooks. Each agent works in its own worktree and proves its package with
  `node --test`, tsc and oxlint.
- M1-T37 reinstalls the hooks so they run `pnpm cli ok`. The owner merges the
  branch only after `pnpm cli ok` passes with deno off PATH.
- Agents never push, tag or release; the owner does.
