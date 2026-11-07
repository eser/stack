---
id: TASK-241
title: Prepare the first release after the cutover for the owner
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-27 23:10'
labels:
  - release
  - docs
milestone: m-2
dependencies:
  - TASK-235
  - TASK-236
  - TASK-237
  - TASK-239
  - TASK-240
priority: high
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decisions release-version and first-release-timing:
- Prepare the version bump with the release command in dry-run mode, and set the install.sh npm-only gate variable to that version.
- Finish the CHANGELOG Unreleased, Migration section: npm library packages, the Node floor, the binary channels status and the forwarding stubs.
- Run preflight.
- Write a checklist for the owner covering:
  - the npm bootstraps
  - whether to wait for M3-T11
  - applying the M2-T10 patches to the template repos and the homebrew-tap
  - the JSR freeze state
  - confirming that install.sh decides correctly against the new release's archive list
Do not tag or publish.

Decisions this task waits on: decision-11 (When install.sh and install.ps1 stop offering eser, noskills and laroux); decision-13 (When the first release after the cutover happens); decision-23 (How the laroux template repos and the homebrew-tap migrate); decision-29 (Version of the first release after the cutover).

Plan key: M2-T9. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `pnpm cli preflight` passes
- [x] #2 The Migration section covers every break from M0 to M2
- [x] #3 The checklist is in the task; no tag, push or publish was made
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worked on 2026-10-27 in the worktree of branch first-release-prep at 54574790, macOS arm64, Node 26.12.1. Nothing was committed, tagged, pushed or published, and no registry was asked to store anything.

### Version bump, dry run only

- `go run ./cmd/eser codebase release major --dry-run`: PlanRelease (pkg/ajan/codebasefx/release.go) only reads, and the command returns after printing the plan. It printed "Release v5.0.0 (from 4.5.2), 85 changelog entries" and the edits of 54 files: the root package.json and the 51 package.json files under pkg/@eserstack/ (4.5.2 to 5.0.0), VERSION (4.5.2 to 5.0.0) and CHANGELOG.md (a generated `## 5.0.0 - 2026-10-27` section with Added, Fixed, Changed and Removed), then "Would commit "chore(codebase): release v5.0.0", push it, and push v5.0.0."
- `pnpm cli codebase release major --dry-run` (the TypeScript release.ts; versions() writes nothing under dryRun, and changelog_git.go:82 returns before the write): "Version: 4.5.2 -> 5.0.0", "Changelog: generated", "Tag: v5.0.0 (would be created and pushed)", "No changes were made." Before `make ajan-lib` had run in this worktree it printed "Changelog: no user-facing changes": the changelog step needs the native library, and release.ts:293 swallows its load error.
- `git status` was clean after every dry run and after both preflight runs.

### install.sh and install.ps1 gate

`LAROUX_NPM_ONLY_VERSION="5.0.0"` (etc/scripts/install.sh:16) and `$LarouxNpmOnlyVersion = '5.0.0'` (etc/scripts/install.ps1:66) already hold the decision-29 version since TASK-226. TestInstallShDecidesFromTheRelease (cmd/noskills/install_dry_run_test.go) pins it: laroux at 5.0.0, 5.1.2 and 6.0.0-rc.1 goes to npm, at 4.5.2 and 4.10.0 installs the archive. No change was needed.

### CHANGELOG Migration

The Done tasks of m-0, m-1 and m-2 were walked against the Unreleased Migration section, with TASK-252, 253, 261, 362, 368, 370 and 371, and with the Done tasks outside a milestone whose change landed after v4.5.2 (TASK-11, 15, 20). Package exports and mod.ts names were compared with `git show v4.5.2:`. Already covered: the npm libraries and the JSR freeze, the Node 26.9 floor, the Go binaries and the install channels, the laroux forwarding stub, the removed jsx-runtime and laroux-runtime with their recipes, and `laroux init` on the kit recipe (TASK-370).

Added, each with the upgrade step:

- Runtime and distribution: the Go `eser` binary forwards `posts`, `laroux` and `noskills` to their own programs or npx and drops the `.`, `nos`, `wf` aliases, `ajan` and `codebase commitmsg` (TASK-245, 252); the Go `noskills` forwards unported commands to the TypeScript CLI or npx (TASK-261); the deprecated laroux Homebrew formula (TASK-371, TASK-240).
- @eserstack/codebase: `./lint-plugin` removed, `PackageConfig.imports` removed, `validate()` runs `validate-naming-and-todos`, release formats with `node --run fmt` (TASK-191, 203, 204).
- @eserstack/kit: whole-repo `kit clone` needs the native library (TASK-234).
- @eserstack/posts: routing keys from the process environment only and validated, `AuthorizationRequest.state` (TASK-15, 20).
- @eserstack/shell: flag parsing on node:util parseArgs (TASK-233).
- @eserstack/standards: `statSync`, `isStandalone`, `PermissionDeniedError`, semver types (TASK-180, 201, 234).
- @eserstack/laroux: `buildFallbackHandler` removed. @eserstack/laroux-bundler: import-map types (TASK-207). @eserstack/laroux-server: binds `server.host`, the `POST /_rsc` guards, the proxy chain of `GET /rsc` (TASK-181, 271, 280).
- @eserstack/http: rate limiter `trustProxy` default and peer address (TASK-11). @eserstack/formats: CSV header and TOML `pretty` (TASK-234).
- @eserstack/ajan: no `FFILibrary.symbols`, removed backend selection API, WASM without command mode, one `@eserstack/ajan-wasm` module (TASK-202, 238, 272, 273).
- Go: lib helpers moved to `lib/netlib`, logfx OTLP moved to `logfx/otlp` and `InnerPropagator` removed, formatfx nesting limit, codebasefx walk-root error, `validatortools` and `WorkspacePackageConfig` (TASK-204, 272, 274, 276, 278). Native bridge: the dispatcher ABI 3 with six exports, the WASM profile, the nesting limit (TASK-238, 272, 276).
- One correction: the `EserAjanShellExec` entry no longer names "command-mode WASM `shellExec`", since command mode is gone (TASK-273).

Seen and left out: the published declarations of laroux-react and laroux-server import `react` types while `@types/react` is a devDependency (TASK-236), so a consumer with `skipLibCheck` off installs `@types/react` itself. It needs no code change, so it has no Migration entry.

Findings outside this task's scope, for their own tasks:

- .eser/recipes/library-pkg/package.json:12 depends on `"@eserstack/test-kit": "workspace:*"` and mod.test.ts:4 imports it, but pkg/@eserstack/test-kit/package.json:4 is private, so the Recipes Migration entry's step "replace `workspace:*` with `^5.0.0`" cannot install it outside the workspace.
- InsertIntoChangelog (pkg/ajan/codebasefx/changelog.go:138) puts the generated `## 5.0.0` section before the first `##` heading, which is `## Unreleased`. The Migration section then stays under `## Unreleased`, below `## 5.0.0`, and etc/scripts/release-notes-from-changelog.ts copies only the `5.0.0` section into the GitHub release notes.

### Preflight and gate

- `pnpm preflight` (Go eser) and `pnpm cli preflight` (TypeScript CLI): all 18 steps passed, "All checks passed!". The library-consumer failure TASK-237 recorded (TS2591 in ajan's offload.d.ts) no longer occurs.
- `pnpm ok`: all 34 steps passed, "All checks passed!", after the CHANGELOG edits.

### Checklist for the owner

Preconditions and facts as of 2026-10-27. Nothing in this list was done by this task.

1. CI on these commits
   - main is 95 commits ahead of origin/main at 54574790 (`git rev-list --count origin/main..HEAD`), and CI has not run on any of them. The preflight on main, `laroux-smoke`, `windows-smoke` (the install.ps1 tests), `ffi-workers` and `cross-runtime-test` have no run for this tree.
   - TASK-237 AC #1, the `laroux-smoke` job on Linux and macOS, has not run, so TASK-237 is In Progress.
   - The preflight above ran on macOS arm64 only.
2. npm bootstraps (docs/agents/release-and-ci.md, Bootstrapping New npm Names)
   - 43 names answered E404 on 2026-10-26: the 38 libraries (`@eserstack/agents` to `@eserstack/workflows`, listed in that section) and the five `@eserstack/noskills-<platform>` packages. Each needs a first manual publish (the `0.0.0-bootstrap.0` placeholder under the `bootstrap` dist-tag, steps in that section) and then a trusted publisher on npmjs.com for GitHub Actions, repository eser/stack, workflow build.yml. The platform packages can instead get their first version from publish-ajan.yml in bootstrap mode.
   - The six `@eserstack/ajan-*` packages and `eser`, `noskills` and `laroux` exist at 4.5.2. Whether each has a trusted publisher for build.yml was not checked here.
   - In build.yml, `publish-ajan` publishes the ajan and noskills platform packages before `publish`, and `noskills@5.0.0` pins its platform packages exactly. A name without a bootstrap fails its job with a 404 on the PUT; etc/scripts/publish-libraries.ts:257 names the bootstrap section in that error.
   - The loop in that section lists the missing names again.
3. TASK-254 (M3-T11)
   - Status To Do. Its dependencies: TASK-248 In Progress, TASK-249 to 253 Done. decision-13 (accepted 2026-10-15) holds the first release until M3-T11.
   - The tree as it is: ReleaseBinaries (pkg/ajan/codebasefx/release_artifacts.go:60) already builds Go eser archives, so install.sh, Homebrew, Nix and `eser update` deliver the Go eser, while the npm `eser` stays the TypeScript CLI bundle. The two differ as the Migration entry describes. No preflight test covers the self-update of an installed v4.5.x eser binary to the Go eser (TASK-254 AC #4; `legacy-binary-update` covers laroux and noskills). `npx <packed eser> noskills --version` (TASK-261 AC #3) waits on the launcher.
   - What TASK-254 adds: the npm `eser` becomes a launcher of the Go binary with per-platform optional dependencies (new npm names, which TASK-254 lists for a bootstrap), depending on `noskills` and setting ESER_PLUGIN_PATH; dry runs of install.sh, install.ps1, Homebrew, Nix and the packed launcher; the self-update test from a v4.5.2-named archive in preflight; a clear failure on an unsupported platform. The npm and binary eser are then the same program.
4. Template repos and homebrew-tap (TASK-240, decision-23)
   - Template repos: no patch. The four gh:eser/laroux-template-* repos do not exist, and `laroux init` scaffolds the laroux-app kit recipe since TASK-370.
   - homebrew-tap: the patch and its apply commands are in TASK-240, Implementation Notes, "homebrew-tap: patch ready", for a clone of eser/homebrew-tap at 73d7404, applied by hand. It adds a deprecated Formula/laroux.rb on the v4.5.1 binaries, drops the `version` line of Formula/eser.rb, removes the root noskills-server.rb and adds a laroux section to the README.
   - Since TASK-371, the `update-homebrew` job (`eser dev homebrew`) writes Formula/eser.rb, noskills.rb, noskills-server.rb and laroux.rb from the 5.0.0 archives with no `version` line, laroux.rb as the stub with `deprecate! date: "2026-10-27"`. It replaces the patch's laroux.rb and does not remove the root noskills-server.rb. The job is continue-on-error (build.yml:1322), and the tap's eser.rb is still at 4.1.56.
5. JSR freeze (decision-5)
   - JSR stays at 4.5.x; no job publishes to it (build.yml:786), and no deno.json or jsr.json manifest is left in the packages.
   - 35 package READMEs still name `jsr:@eserstack/<name>` as the install line, for example pkg/@eserstack/crypto/README.md:8, pkg/@eserstack/webtransport/README.md:8 and pkg/@eserstack/httpclient/README.md:14, and 12 link to jsr.io. Those lines install the frozen 4.5.x, and npm shows each package's README on its page.
6. install.sh against the 5.0.0 archive list
   - The release run builds, for each of eser, noskills, noskills-server and laroux (the stub), `<binary>-v5.0.0-<triple>` for aarch64-apple-darwin, x86_64-apple-darwin, aarch64-unknown-linux-gnu and x86_64-unknown-linux-gnu (`.tar.gz`) and x86_64-pc-windows-msvc (`.zip`), and `upload-assets` uploads them with SHA256SUMS.txt and the cosign `.bundle` files.
   - install.sh reads releases/latest, or the tag ESER_INSTALL_VERSION names. laroux at 5.0.0 prints `npm i -g laroux` and exits non-zero before any download (install.sh:89-92), although the release has the laroux stub archive. eser, noskills and noskills-server download their archive, check it against SHA256SUMS.txt and install it. On a 404, eser and noskills print `npm i -g <product>` and exit non-zero, and noskills-server fails with the missing archive name.
   - `upload-assets` needs `release-notes`, which creates the GitHub release. Between the two, releases/latest is v5.0.0 with no archives, and install.sh answers the npm command for eser and noskills and an error for noskills-server.
   - Checks: TestInstallShInstallsTheGoNoskills and TestInstallShDecidesFromTheRelease ran in `pnpm ok` (go-tests); the install.ps1 tests need Windows and run in `windows-smoke`. `curl -fsSL https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.sh | ESER_INSTALL_VERSION=5.0.0 sh -s noskills` runs the script against a published release's real archive list.
<!-- SECTION:NOTES:END -->
