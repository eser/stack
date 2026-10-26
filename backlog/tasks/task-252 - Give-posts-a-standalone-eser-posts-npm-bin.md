---
id: TASK-252
title: Give posts a standalone eser-posts npm bin
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 18:00'
labels:
  - posts
  - npm
  - cli
milestone: m-3
dependencies:
  - TASK-232
  - TASK-245
priority: high
ordinal: 252000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
posts has no standalone npm bin today; it ships inside the eser bundle. Per decision posts-future, add `bin: { "eser-posts": "./dist/main.js" }` to the posts package on the M2-T1 emit, with the posts CLI entry it needs. Check the existing bins: laroux keeps `laroux` and noskills keeps `noskills`. This lands before M3-T11, so the Go eser can forward to all three from the first release.

Decisions this task waits on: decision-28 (posts in Go or as a Node plugin).

Plan key: M3-T13. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The packed posts package installs an `eser-posts` bin that runs `--help` on Node 26
- [x] #2 The Go eser forwarding test resolves eser-posts, laroux and noskills from packed packages
- [x] #3 The posts README documents both `eser posts` and `npx -p @eserstack/posts eser-posts`
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- pkg/@eserstack/posts/main.ts is the CLI entry: it mounts the same moduleDef that `eser posts` mounts at the root of an `eser-posts` command, parses the process arguments, prints a failure message on stderr and sets the exit code, and exits naturally, like noskills/main.ts and laroux-server/cli.ts. It does not use cli-support's exitCli, which would add a dependency on @eserstack/codebase; `--help` loads no posts command and no FFI library. main.test.ts runs it with `--help` in a child process. Like the noskills and laroux entries, the shell/args command has no `--version`, and an unknown command prints the help.
- package.json: `bin: { "eser-posts": "./main.ts" }` in the workspace, so the source runs directly, and `publishConfig.bin: { "eser-posts": "./dist/main.js" }`, which pnpm puts in place of `bin` when it packs. The packed manifest names only ./dist/main.js, and main.ts is not in the tarball; tsc keeps the shebang in dist/main.js. This is the same shape as the `publishConfig.bin: {}` that TASK-236 gives @eserstack/cli. gen-library-manifests.ts already keeps every publishConfig field other than `exports`; a new test pins that for a bin map and for `{}`, and its header says so. pnpm-lock.yaml is unchanged.
- cmd/eser forwarding: posts now has the npm package @eserstack/posts, so with no eser-posts on PATH or in ESER_PLUGIN_PATH the Go eser runs `npx --yes --package @eserstack/posts@<version> eser-posts`, or names `npm install -g @eserstack/posts@<version>`. A bin that is not named after its package gets `--package` and the bin name; laroux and noskills keep `npx --yes <package>@<version>`. The branch for a table entry without a package went away with its last user. TestResolvePlugin covers both posts cases; TestForwardReachesTheWorkspaceCLIs now runs `eser posts --help` through a shim into posts/main.ts as well. cmd/eser/README.md lists the npx form.
- AC #1 and #2: etc/scripts/preflight-plugin-bins.ts and two preflight steps. `plugin-bundles-pack` (`--save-bundles`, after noskills-launcher-install) packs the laroux and noskills bundles from their dist/ and this host's @eserstack/noskills-<platform> with npm pack into etc/temp/plugin-packs, before library-build removes the bundles. `plugin-bins` (after library-consumer) installs, with npm and outside the repo, the posts tarball and the tarballs of its 10 @eserstack dependencies from etc/temp/npm-packs together with the three saved tarballs (14 in all). It runs `npx eser-posts --help`, then `go test -run ^TestForwardReachesThePackedCLIs$ ./cmd/eser` with ESER_PACKED_BINS set to the installed node_modules/.bin. It fails when the test does not pass, a skip included. That test resolves `eser posts`, `eser laroux` and `eser noskills` through ESER_PLUGIN_PATH to the installed eser-posts, laroux and noskills bins, runs each with `--help` and checks its help text. Without ESER_PACKED_BINS it is skipped, so precommit is unaffected. Run locally on Node 26.12.1 (npm-build noskills and laroux, compile-current, npm-binaries, `--save-bundles`, library-build, library-pack, then the check): "npx eser-posts --help on Node 26.12.1 → OK" and the posts, laroux and noskills subtests passed. docs/agents/release-and-ci.md describes the step.
- Finding for the release (not changed here): pnpm pack writes the staged noskills binary of a noskills-<platform> package at mode 0644, while npm pack keeps 0755. In the first run of this check, which used the pnpm-packed platform tarball, `eser noskills --help` failed with EACCES. The publish-platform job in build.yml publishes these packages with `pnpm publish`, so a published binary may not be executable unless the launcher sets the mode. The plugin-bins check uses an npm-packed platform tarball, as preflight-noskills-launcher.ts does.
- AC #3: the posts README Command Line section documents `eser posts`, `npx -p @eserstack/posts eser-posts`, `npm install -g @eserstack/posts` and how the Go eser reaches the bin.
- Gate: `pnpm ok` printed "All checks passed!".
<!-- SECTION:NOTES:END -->
