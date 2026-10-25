---
id: TASK-188
title: >-
  Build the ajan native library and WASM with Makefile targets instead of Deno
  scripts
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 07:56'
labels:
  - ajan
  - build
  - go
  - ci
  - docs
milestone: m-0
dependencies:
  - TASK-174
  - TASK-185
priority: high
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace pkg/@eserstack/ajan/scripts/build.ts, scripts/package.ts and npm/generate-packages.ts with Makefile targets: `ajan-lib TARGET=<triple>`, `ajan-wasm` and `ajan-packages`. Use GOWORK=off, the cross-compiler table from targets.ts and `-ldflags -X main.Version` from VERSION. A small Go helper or install step stages the libraries into the six ajan-* packages.
Point every caller at make:
- the precommit build-native-lib step and the preflight ajan builds
- the .mise.toml tasks and the compile.ts `--all` build at :280
- the CI jobs build-ajan-darwin, compile-binaries, cross-runtime-test and publish-ajan.yml, which then need only Go and clang, with no pnpm install
In the same task, update every text that names the deleted scripts:
- the fix hint at cli/commands/ajan.ts:56, which prints `deno run --allow-all pkg/@eserstack/ajan/scripts/build.ts`; it now prints `make ajan-lib`
- the six ajan-* platform package READMEs
- the .gitignore:69-70 comment
- the ajan README build section

Decisions this task waits on: decision-40 (How the ajan native and WASM libraries are built).

Plan key: M0-T15. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `make ajan-lib` builds the host library, every `TARGET=` cross build still works, and `make ajan-packages` fills the platform package directories
- [x] #2 `git grep -n 'scripts/build.ts\|scripts/package.ts\|generate-packages'` returns nothing outside history
- [x] #3 No CI step runs deno or pnpm to build ajan
- [x] #4 The FFI test suites pass under `deno task cli ok`
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. Makefile targets ajan-lib (TARGET=<id>, default this host), ajan-wasm, ajan-all, ajan-packages and ajan-clean, with GOWORK=off, the cross-compiler table of targets.ts and -ldflags "-s -w -X main.Version=$(VERSION)"; ajan-packages copies the libraries and the header (and the WASM modules) into the six committed ajan-* members as the deleted generate-packages.ts did. pkg/@eserstack/ajan/makefile-targets.test.ts checks the Makefile table against NATIVE_TARGETS and WASM_TARGETS. Verified: make ajan-lib on darwin/arm64 and TARGET=x86_64-darwin (Mach-O x86_64); aarch64-linux, x86_64-linux and x86_64-windows in a golang:1.26-bookworm container with the Debian cross-compilers (ELF aarch64, ELF x86-64, PE32+ DLL); make ajan-wasm; make ajan-packages; an unknown TARGET fails with the list. Callers moved to make: the precommit build-native-lib step and the preflight ajan builds (.eser/manifest.yml), .mise.toml, compile.ts --with-go (make -C <root> ajan-all), the cli ajan hint, the parity test hint. Texts updated: the six platform READMEs, the ajan README (Build, Distribution; the Packaging section is gone with package.ts, whose archives no CI step produced), the browser example, .gitignore, docs/agents/release-and-ci.md. scripts/build.ts, scripts/package.ts and npm/generate-packages.ts are deleted. deno task cli ok, deno task cli preflight and make ok passed.

Waiting on the owner (AC #2 and #3): the CI edits are a patch, not applied, because workflow changes need approval. etc/temp/ci/task-188-ci.patch (gitignored) switches cross-runtime-test, build-ajan-darwin, compile-binaries, and publish-ajan.yml's build-darwin and build-and-publish to make, and drops the Deno, pnpm, Node and install steps from the two darwin jobs and Deno from build-and-publish (it keeps pnpm and Node to publish); compile-binaries keeps Deno and pnpm for compile.ts. git apply --check passes and the patched YAML parses. Apply it with git apply etc/temp/ci/task-188-ci.patch after review. Left alone: TODOS.md history entries (TASK-230 rewrites them) and the stale, unreferenced npm/root-package.json.

2026-10-25: the owner approved applying the CI patches. etc/temp/ci/task-{188,189,249,251,264}-ci.patch were applied in that order to .github/workflows (build.yml, publish-ajan.yml, update-contributors.yml); actionlint is clean; make ok and deno task cli ok passed.
AC #2: git grep for scripts/build.ts, scripts/package.ts and generate-packages returns nothing outside history. The remaining hits are TODOS.md entries describing the pre-backlog release pipeline (the v4.1.x ranges are gone; the platform packages are workspace:* now), plus the CHANGELOG and the backlog. A codebasefx test fixture path was renamed to scripts/release.ts.
AC #3: every ajan build in CI is make ajan-lib / ajan-wasm / ajan-packages. 'deno task cli build' in build.yml builds the CLI's npm package, not ajan.
<!-- SECTION:NOTES:END -->
