---
id: TASK-128
title: >-
  Keep a single value a single document in formats serialize and keep TOML
  integers
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-15 19:34'
labels:
  - formats
  - bug
dependencies: []
references:
  - pkg/@eserstack/formats/serializer.ts
  - pkg/ajan/formatfx/format_toml.go
  - pkg/@eserstack/formats/README.md
priority: medium
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
serialize in pkg/@eserstack/formats/serializer.ts:24 wraps every non-array value in a list before sending it to Go, so serialize({ name: 'app', replicas: 3 }, 'json') returns '[{...}\n]\n' and 'yaml' returns a one-item sequence. The TOML output from Go writes integers as floats ('replicas = 3.0') because the JSON request decodes numbers as float64 in pkg/ajan/formatfx. Pretty JSON for arrays comes out as '[\n{...}\n,\n{...}\n\n]\n'. The formats README documents the current behavior and must change with it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A non-array value serializes as one document in JSON, YAML and TOML, or the decision to keep wrapping is documented
- [x] #2 TOML keeps integer types, with a Go test
- [x] #3 Pretty JSON arrays have a normal layout
- [x] #4 The formats README matches
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Verified independently. Decision (from stage 1, kept): a value that is not an array is one document in every format. The Go format layer gets FormatOptions.Document, which the bridge sets from the request's `document` field; serializer.ts sends document:true for any value that is not an array. TOML converts whole-number float64 values within +-2^53 to int64, on a copy, at any depth. JSON array layout matches the TypeScript format and JSON.stringify for arrays that are not empty. An empty pretty array is "[\n]\n" on both the Go and the TypeScript side, so they still match each other. YAML honors Indent (default 2). README, WIRING.md and the serialize JSDoc match the code: I checked each remaining README divergence row with a Go vs TypeScript probe against a freshly built native library. The bridge follow-ups are verified too: TASK-70 (DefaultCommandPrefix) and TASK-149 (postInstallFailed through newKitApplyRecipeResults).
<!-- SECTION:NOTES:END -->
