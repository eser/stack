---
id: TASK-216
title: 'kit and cs: pass tests on Node and remove the JSR recipe provider'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 10:00'
labels:
  - cutover
  - kit
  - cs
milestone: m-1
dependencies:
  - TASK-198
  - TASK-202
priority: medium
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One commit per package.
- kit: delete the unimplemented jsr recipe provider (recipes/providers/jsr.ts, mod.ts:15-16) and the `deno add` text in registry-schema.ts:63. Confirm that the 15 `using x = mock.stub(...)` tests work through test-kit.
- kitfx: per decision user-deno-projects, keep and allowlist the Deno project type and `deno add` instructions in pkg/ajan/kitfx/deps.go:20-21, :82, :89, types.go:93 and kitfx_coverage_test.go, or delete them if the owner drops that support.
- cs: port the tests and remove the deno lines from the README.

Decisions this task waits on: decision-12 (Keep supporting users whose own projects use Deno).

Plan key: M1-T22. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `node --test` passes for kit and cs
- [x] #2 No jsr provider remains, and `git grep -wni deno pkg/@eserstack/kit pkg/@eserstack/cs pkg/ajan/kitfx` matches only the allowlist; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: kit 21 of 21 files (247 tests); cs 2 of 2 (49 tests). The 15 `using x = mock.stub(...)` tests pass through test-kit on Node.
- Source: kit jsr: 3 and npm: 2: recipes/providers/mod.ts:15-16, providers/jsr.ts:30 (delete), providers/npm.ts:28, recipes/registry-schema.ts:63 (`deno add`); import.meta.main 1 in main.ts needs no change. cs: 0.
- Sanitizer options: cs generate.test.ts 1, sync.test.ts 1.
- Go: pkg/ajan/kitfx/deps.go (3), types.go (1), kitfx_coverage_test.go (5), kept per decision-12. csfx is clean.
- Docs: pkg/@eserstack/cs/README.md (5).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.
TASK-216 (2026-10-26):
- kit: deleted recipes/providers/jsr.ts and jsr.test.ts and the jsr branch of providers/mod.ts; the new providers/mod.test.ts checks that `jsr:` is now an unknown scheme. Dropped the `jsr:` row from the README specifier table and the `deno add` text from registry-schema.ts. The 15 `using x = mock.stub(...)` tests pass through test-kit.
- kit tsc: recipes/testing.ts adds `readableStreamFrom`, a typed `ReadableStream.from` the DOM lib does not declare, used by the four stream tests; explicit types on DEFAULT_MAX_BYTES, DEFAULT_POST_INSTALL_TIMEOUT_MS and BINARY_EXTENSIONS for isolatedDeclarations.
- kit and cs: Deno-specific comments, the cs shebang, the CLI help text and the README CLI examples now name node and `eser cs`.
- cmd/eser: TestKitParityWithTypeScript and TestCSGenerateMatchesTypeScript run the TypeScript CLIs with node (kit through NODE_USE_ENV_PROXY and NODE_TLS_REJECT_UNAUTHORIZED=0 against the fake GitHub); every case and comparison is unchanged. app_test.go's deno strings test shellArgs, not kit or cs.
- Results: node --test kit 248/248, cs 51/51; tsc and oxlint clean for both; go vet, go test and golangci-lint clean for cmd/eser.
- Open for AC #2: the remaining `git grep -wni deno` matches are decision-12 user-Deno support. ADR 0005 Appendix B still needs rows for pkg/@eserstack/kit/recipes/dependency-resolver.ts and its test, and for the kitfx tests (kitfx_coverage_test.go, kitfx_engine_test.go) and pkg/ajan/kitfx/README.md.
The integration agent extended ADR 0005 Appendix B: the kitfx row now covers deps.go, types.go, their tests and README, and a new row lists pkg/@eserstack/kit/recipes/dependency-resolver.ts and its test as the TypeScript twin of ProjectTypeDeno and its `deno add` hints (decision-12). AC #2 holds.
<!-- SECTION:NOTES:END -->
