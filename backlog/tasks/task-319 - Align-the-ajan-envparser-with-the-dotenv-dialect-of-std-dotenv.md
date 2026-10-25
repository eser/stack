---
id: TASK-319
title: Align the ajan envparser with the dotenv dialect of @std/dotenv
status: Done
assignee: []
created_date: '2026-10-24 21:20'
updated_date: '2026-10-25 02:59'
labels:
  - configfx
  - bug
dependencies: []
priority: medium
ordinal: 322000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/ajan/configfx/envparser and @std/dotenv (used by @eserstack/config) read the same .env text differently, so a value can change with the runtime that loads it (the native cs generate path, ajan config). Found while moving cs to Go (TASK-250) with a probe of both parsers: 'KEY = value' (spaces around =) is accepted by @std/dotenv and rejected by Go (extractKeyName in envparser.go); Go expands ${VAR} and $VAR inside double quotes, @std/dotenv keeps them literal and expands only unquoted values; '\t' in double quotes is a tab in @std/dotenv and 't' in Go; '${MISSING:-default}' gives 'default' in @std/dotenv and ':-default}' in Go; '\${P}' keeps the backslash in @std/dotenv; 'KEY.DOT=1' is ignored with a warning by @std/dotenv and kept by Go. The empty-value bug (EMPTY= swallowing the next line) is already fixed in TASK-250.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each difference above has a decision: follow @std/dotenv, or keep the Go behavior and document it
- [x] #2 A shared fixture runs through both parsers in a test and gives the same values
- [x] #3 The configfx README documents the dialect
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 recommendation for the owner, not applied (the AC asks for a decision per difference):
- 'KEY = value': accept it, as @std/dotenv does. Rejecting a common .env form only breaks Go loading.
- Expansion inside double quotes: follow @std/dotenv and keep it literal. Expanding there surprises users of the TS loader and makes '${' in passwords unsafe.
- '\\t' in double quotes as a tab: follow @std/dotenv (and Go's own '\\n' handling).
- '${VAR:-default}': support it, as @std/dotenv does.
- A backslash before $ kept: follow @std/dotenv.
- Dotted keys (KEY.DOT): keep accepting them in Go and document it. configfx maps nested config keys that way, and rejecting them would break existing ajan configs.
All but the last change ajan's config loading, so they belong in a release note.

2026-10-25: applied the recommendation above (one decision per difference; the owner can still veto any before release).
Followed @std/dotenv:
- 'KEY = value' is accepted;
- double-quoted values are not expanded;
- double-quote escapes are \n \r \t \" \' and \\, and other pairs stay as written;
- ${VAR:-default} and $VAR:-default work;
- '\$NAME' keeps its backslash, and '\${NAME}' gives a backslash plus the value;
- expansion runs after the whole file is read, so a forward reference resolves;
- one newline after the opening quote and before the closing quote is dropped.
Also fixed: 'exported=1' was read as key 'ed' (the export prefix was cut without a following space).
Kept in Go and documented in the configfx README:
- dotted keys and 'KEY: value';
- an unquoted '#' with no space before it stays in the value;
- an undefined name without a default is empty (@std/dotenv writes 'undefined' or reads the process env);
- expansion stops after 10 passes or when nothing changes (@std/dotenv loops forever on A=$A).
AC #2: envparser/testdata/dialect.env and dialect.json run through TestParseBytes_SharedDialect (Go) and pkg/@eserstack/config/dotenv/dialect.test.ts (@std/dotenv); both read the same values. The Go test failed before the change. TestParseBytes_GoDialectExtensions pins the kept differences.
AC #3: configfx README, section 2. CHANGELOG migration entry under 'Go: pkg/ajan/configfx'.
go test ./pkg/ajan/configfx/... ./pkg/ajan/csfx/... ./cmd/eser/... ok; golangci-lint on configfx: 0 issues. The full gate waits on the concurrent TASK-325 work.

2026-10-25: rtk make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
