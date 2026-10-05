---
id: TASK-128
title: >-
  Keep a single value a single document in formats serialize and keep TOML
  integers
status: To Do
assignee: []
created_date: '2026-10-04 20:51'
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
- [ ] #1 A non-array value serializes as one document in JSON, YAML and TOML, or the decision to keep wrapping is documented
- [ ] #2 TOML keeps integer types, with a Go test
- [ ] #3 Pretty JSON arrays have a normal layout
- [ ] #4 The formats README matches
<!-- AC:END -->
