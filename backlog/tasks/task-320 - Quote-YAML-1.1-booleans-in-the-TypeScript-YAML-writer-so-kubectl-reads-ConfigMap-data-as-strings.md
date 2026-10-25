---
id: TASK-320
title: >-
  Quote YAML 1.1 booleans in the TypeScript YAML writer so kubectl reads
  ConfigMap data as strings
status: Done
assignee: []
created_date: '2026-10-24 21:20'
updated_date: '2026-10-24 23:22'
labels:
  - formats
  - cs
  - bug
dependencies: []
priority: medium
ordinal: 323000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/formats/formats/yaml.ts writes the string 'yes' (and no, on, off, y, n) unquoted, because the yaml library follows YAML 1.2. kubectl reads manifests with a YAML 1.1 parser (sigs.k8s.io/yaml), which turns those values into booleans, so a ConfigMap from 'eser cs generate' with LOCAL_ONLY=yes fails to apply on the pure TypeScript path; the Go writer (yaml.v3) quotes them. Found while comparing the Go and TypeScript cs output in TASK-250. Related: cs generate -o json prints a one-item JSON array on both paths, which kubectl apply does not take as a manifest.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The TypeScript YAML writer quotes strings a YAML 1.1 reader would read as booleans or numbers, with a test
- [x] #2 cs generate -o json prints one object, or the array is documented as intended
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25. formats/yaml.ts writes with the yaml library's version '1.1', so strings a YAML 1.1 reader (kubectl's sigs.k8s.io/yaml, PyYAML) takes for booleans, numbers or dates are quoted: yes, no, on, off, y, N, 1_000, 2001-12-14, 012. Real booleans and numbers stay plain, and reading stays YAML 1.2. Go's yaml.v3 already quotes the same set (probed), so the native and TS writers agree. Test: formats.test.ts 'YAML quotes strings a YAML 1.1 reader takes for other types', with a read-back. Keys that are 1.1 booleans get quoted too ('n': ...). AC #2: kept the JSON array and documented it as intended in the cs README, because generate.test.ts pins Array.isArray and scripts may read .[0]. The README shows '... -o json | jq '.[0]' | kubectl apply -f -'. YAML is one document since TASK-250. Waits on a clean gate (concurrent agent work).

2026-10-25: deno task cli ok and make ok passed with all concurrent work in place.
<!-- SECTION:NOTES:END -->
