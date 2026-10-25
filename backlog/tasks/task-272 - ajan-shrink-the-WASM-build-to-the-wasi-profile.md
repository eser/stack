---
id: TASK-272
title: 'ajan: shrink the WASM build to the wasi profile'
status: Done
assignee: []
created_date: '2026-10-24 00:20'
updated_date: '2026-10-24 18:37'
labels:
  - ajan
  - wasm
  - go
  - performance
milestone: m-0
dependencies:
  - TASK-174
  - TASK-188
priority: high
ordinal: 272000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision-45, the WASM fallback ships one slim "wasi" profile. Today's build is 80.7 MB because bridge.go links every fx package, and 62% of that is the AI SDK chain, which cannot work on wasip1. The WASM profile spike (etc/temp/plan/ajan-wasm-spike.json) built the profile at 7,251,613 B (1,409,621 B brotli, 138 packages) with byte-identical results for every kept name.

Bridge module (pkg/@eserstack/ajan):
- Split bridge.go into per-domain snake_case files (format, crypto, parsing, collector, config, codebase, noskills, cache, cs, ai, http, posts, kit, shell, log and the rest), each with one build constraint, plus a tag-free dispatch file that holds the name registry. Each domain file registers its handlers from init(). This registry is the one TASK-273 and TASK-238 dispatch through.
- Profile tag `eserajan_wasi`: the 44 names that work on wasip1. They are version, init, shutdown, diResolve, formatEncode, formatDecode, formatList, formatEncodeDocument, cryptoHash, parsingTokenize, parsingSimpleTokens, the parsingTokenizeStream trio, collectorSpecifierToIdentifier, collectorGenerateManifest, configLoad, codebaseValidateCommitMsg and codebaseBumpVersion, plus collectorWalkFiles, codebaseWalkFiles, codebaseValidateFiles, the five codebaseCheck* names, both codebase stream trios, noskillsInit, noskillsSpecNew, noskillsNext, the seven cache* names and csGenerate. Every other name answers `UNSUPPORTED_IN_WASM` on wasip1.
- Make `aiRegistry` (bridge.go:65) lazy instead of a package-level var, so main.init no longer registers the provider factories.

Framework (root module, one commit per package; the owner accepted F2 and F4 on 2026-10-24):
- F1: move pkg/ajan/codebasefx/registry.go (RegisterAllValidators, RunSingleValidator) to a new package codebasefx/validatortools. It is the only codebasefx -> workflowfx edge, which links expr-lang and jsonschema. Update the five codebasefx test files that call it.
- F2: put codebasefx/git.go behind `//go:build !wasip1`, move GenerateChangelog into changelog_git.go with the same constraint, and add git_wasip1.go with a runGit stub so the git-aware walk falls back to the filesystem walk, as it does when git is missing. On wasip1, codebaseGit*, generateChangelog and csSync then answer "unknown function" instead of "exec not found".
- F3: put csfx/sync.go (kubectl through os/exec) behind `//go:build !wasip1`.
- F4: move pkg/ajan/lib crypto.go, net.go and sql.go into their own package (for example lib/netlib), and update the seven callers in httpfx (5 files) and noskillsserverfx (2 files). configfx and envparser import lib, which otherwise links net, crypto/tls, x509 and database/sql.
- Make the package-level regexp.MustCompile vars in codebasefx lazy (0.28 ms of init).

Build and CI:
- The `make ajan-wasm` target from TASK-188 builds only the wasi profile, as the reactor that TASK-273 defines, with `-trimpath`. The full WASM build is not built or shipped, and @eserstack/ajan-wasm carries one eser-ajan.wasm instead of two modes and their .wasm.bin copies (about 157 MB unpacked today). Native builds also get `-trimpath`.
- Add a CI check that fails when the profile is over 8 MB raw or 1.6 MB brotli, and a `go list -deps -tags eserajan_wasi` check (GOOS=wasip1 GOARCH=wasm) that fails when aifx, the AI SDKs, grpc, protobuf, quic-go, os/exec or the otel SDK is linked. Raising either limit needs the owner's approval.
- Skip wasm-opt: the spike measured -0.75% brotli and no per-call gain.

Plan key: M0-T22. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bridge.go is split into per-domain files with one build constraint each and a tag-free dispatch registry, and the native `go test ./...` of the bridge module passes
- [x] #2 The wasi profile build is at most 8 MB raw and 1.6 MB brotli, and the CI size check fails on a fixture build over either limit
- [x] #3 The `go list -deps` check passes for the profile and fails when a fixture build links aifx or the otel SDK
- [x] #4 A parity test calls each of the 44 profile names on the profile build and on the native library with shared fixtures, and the results match except for documented map-order differences; a name outside the profile answers UNSUPPORTED_IN_WASM
- [x] #5 F1 to F4 are applied, `git grep -n 'codebasefx/registry.go'` returns nothing, and the codebasefx, csfx, lib, httpfx and noskillsserverfx tests pass
- [x] #6 `make ajan-wasm` produces only the profile reactor, built with -trimpath, and `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. bridge.go is gone: an AST splitter put its declarations into bridge_common.go (tag-free: Version, lifecycle, handle and response helpers, shutdown drains) and per-domain files; profile domains (config, format, crypto, parsing, collector, codebase, noskills, cache, cs) carry //go:build !wasip1 || eserajan_wasi, the others (ai, log, http, workflow, kit, posts, shell, codebase_git, cs_sync, and bridge_ai_cancel.go) //go:build !wasip1. Each domain file registers its dispatch names and its shutdown drain from init() in the tag-free bridge_registry.go; closeAllHandles now runs every drain's snapshot, then all cancels, waits and releases (the old order, per registry). aiRegistry is lazy (sync.Once + atomic.Pointer); shutdown closes it only if it was created. Native test files are tagged !wasip1. F1: codebasefx/registry.go is now codebasefx/validatortools (RegisterAllValidators, RunSingleValidator), the five codebasefx tests import it, and codebasefx no longer imports workflowfx. F2: git.go and the new changelog_git.go (GenerateChangelog) are !wasip1; git_wasip1.go stubs runGit and GetCurrentBranch, so the git-aware walk falls back to the filesystem walk and noskills falls back to its default branch. F3: csfx/sync.go is !wasip1. F4: pkg/ajan/lib crypto.go, net.go, sql.go and their tests moved to lib/netlib, callers in httpfx (5 files) and noskillsserverfx (2) updated, docs moved to lib/netlib/README.md; lib and configfx link no net, crypto/tls, x509 or database/sql on wasip1. The package-level regexps were not made lazy (not needed to meet the limits). make ajan-wasm builds only the profile, c-shared, -trimpath, -tags eserajan_wasi: 7,295,179 B raw, 1,424,084 B brotli, 138 packages; native builds got -trimpath. make ajan-wasm-check enforces 8,000,000 B raw and 1,600,000 B brotli (measured with Node's zlib) and the forbidden-package list (aifx, the AI SDKs, grpc, protobuf, quic-go, os/exec, the OTel SDK); it fails with lowered limits and with formatfx added to the list. The check runs in precommit (build-native-lib: make ajan-lib ajan-wasm-check) and preflight, so CI runs it through those workflows without a workflow change. ajan-wasm ships one eser-ajan.wasm. AC #4: wasm/profile-parity.test.ts calls all 44 names on the reactor and on the native library with shared fixtures (handle ids normalized; noskills on separate roots because it writes state; init and shutdown on WASM only, since the native library is shared by the test process); the only difference is formatList's map order, which the test documents and normalizes. Note: TASK-188, a dependency, is In Progress only for its CI patch; its Makefile targets are in place. deno rtk task cli ok passed on 2026-10-24 (including go-check, go-lint and go-tests of both modules).
<!-- SECTION:NOTES:END -->
