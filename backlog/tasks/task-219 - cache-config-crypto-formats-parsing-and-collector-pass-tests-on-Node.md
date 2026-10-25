---
id: TASK-219
title: 'cache, config, crypto, formats, parsing and collector: pass tests on Node'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 10:00'
labels:
  - cutover
  - ffi
  - config
  - formats
milestone: m-1
dependencies:
  - TASK-198
  - TASK-202
priority: medium
ordinal: 219000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Six small bridge-backed packages, one commit each; any agent may take one.
- Fix the hand edits from the notes, for example Deno.makeTempDir in the config tests.
- In config, remove DENO_ENV from the environment-name lookup (ENV, APP_ENV and NODE_ENV remain), update config/WIRING.md, and record the change for M1-T36.
- Update the Go twins pkg/ajan/collectorfx/manifest.go:11, :15 (`deno fmt` comments) and pkg/ajan/configfx/envparser/envparser_expand_test.go.
- Run the formats, parsing and crypto FFI suites on node:ffi.
- Remove the Deno.open example in collector/README.md:92.

Plan key: M1-T25. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `node --test` passes for each of the six packages
- [x] #2 No Deno or DENO_ENV reference remains in them or in collectorfx and configfx; tsc and oxlint are clean for each
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 13 files, 11 pass, 2 fail: cache 2/2 (20 tests), crypto 2/2 (27), formats 2/2 (95), parsing 3/3 (20), config 1 of 2 (6 pass, 1 fail), collector 1 of 2 (7 pass, 1 fail).
- Deno API in tests: config/config.test.ts:27 Deno.makeTempDir, writeTextFile, remove (the json_file round trip); collector/walk-fs.test.ts:160 `new Deno.Command(Deno.execPath())` with ESER_AJAN=disabled.
- FFI suites (formats, parsing, crypto) pass through koffi.
- Sanitizer options to remove: formats.ffi 7, formats 1, parsing.ffi 4, lexer 1, crypto.ffi 3, hash 1, cache 3, config 1.
- Source: 0 Deno, Bun or specifier uses; config uses @std/dotenv parse only, which works.
- Go: pkg/ajan/collectorfx/manifest.go (2), pkg/ajan/configfx/envparser/envparser_expand_test.go (1).
- Docs: config/WIRING.md (5), config/README.md (1), formats/WIRING.md (1), collector/README.md (1, the Deno.open example).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled). After them, these test files still fail under `node --test --test-force-exit` on Node 26.12.1, each run alone:
- pkg/@eserstack/collector/walk-fs.test.ts: 1 failing, 5 passing; first error: see the run
- pkg/@eserstack/config/config.test.ts: 1 failing, 2 passing; first error: see the run
- pkg/@eserstack/config/dotenv/dialect.test.ts: 1 failing, 0 passing; first error: see the run

TASK-219 (2026-10-26, node 26.12.1):
- node --test --test-force-exit per package: cache 20/20, config 11/11, crypto 27/27, formats 96/96, parsing 20/20, collector 9/9. tsc and oxlint report nothing for the six packages; go test passes for configfx and collectorfx.
- config.test.ts and walk-fs.test.ts use cross-runtime fs and runtime.exec.spawn of runtime.process.execPath() with --input-type=module --eval.
- dialect.test.ts failed because @std/dotenv parse reads Deno.env for names the file does not set. config/dotenv/parser.ts now parses the same dialect, looks such names up through runtime.env, expands an unresolved name without a default to "" (as configfx/envparser does; @std/dotenv printed "undefined") and stops after 10 expansion passes (a self reference used to loop forever). Tests added in loader.test.ts.
- collector's TS manifest fallback piped its output through `<execPath> fmt -`, which on Node returned nothing; formatter.ts is deleted and the fallback returns the source unformatted, as the Go generator does. Test added in manifest.test.ts.
- DENO_ENV removed from config envVars; README upgrade notes cover it and the "" expansion. The M1-T36 list in TASK-230 already has "DENO_ENV no longer read".
- isolatedDeclarations types added in collector/validator-identifier/mod.ts, config/dotenv/loader.ts and config/manifest.ts.
- Remaining Deno mentions are attributions (deno fresh headers in collector, "the Deno authors" in parser.ts) and the DENO_ENV upgrade note in config/README.md.
- Left for a lockfile change: @std/dotenv in config/package.json and @eserstack/shell in collector/package.json are unused now.
<!-- SECTION:NOTES:END -->
