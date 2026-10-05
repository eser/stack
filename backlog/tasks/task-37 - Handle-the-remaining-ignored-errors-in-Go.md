---
id: TASK-37
title: Handle the remaining ignored errors in Go
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - ajan
  - go
dependencies: []
references:
  - pkg/ajan/codebasefx/validators.go
  - pkg/ajan/codebasefx/registry.go
  - cmd/noskills-server/telemetry.go
priority: medium
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Errors discarded without a reason: pkg/ajan/codebasefx/validators.go:732 (os.ReadFile error treated as empty content), pkg/ajan/codebasefx/registry.go:178 (malformed codebase-filenames rules silently become zero rules), pkg/@eserstack/ajan/main_wasi.go:873-882 (stdout writes in writeOK/writeError), cmd/noskills-server/telemetry.go:61-66,73,93 (load and save errors). Rule: coding-practices: Ignored Errors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each site returns, records or logs the error once, or carries a comment saying why ignoring it is safe
- [x] #2 Malformed validator config fails at load time
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

go-server: The telemetry.go part is verified. Load and save errors are wrapped and returned, main.go logs them once with WarnContext, a malformed file is kept and consent stays no, and telemetry_test.go covers each case. The codebasefx and main_wasi.go sites belong to other units.

go-libs-bridge: The unit's sites are done:
- RunValidators reports read failures as error issues and still passes nil content for missing paths and directories.
- The registry factories return errors before the walk.
- The bridge's validatorsByName fails on malformed filenames or large-file options.
- main_wasi writeEnvelope writes in a single call and exits 1 on failure.
cmd/noskills-server/telemetry.go belongs to another unit.
<!-- SECTION:NOTES:END -->
