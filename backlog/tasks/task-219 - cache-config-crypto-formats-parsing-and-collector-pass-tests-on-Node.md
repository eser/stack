---
id: TASK-219
title: 'cache, config, crypto, formats, parsing and collector: pass tests on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
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
- [ ] #1 `node --test` passes for each of the six packages
- [ ] #2 No Deno or DENO_ENV reference remains in them or in collectorfx and configfx; tsc and oxlint are clean for each
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
<!-- SECTION:NOTES:END -->
