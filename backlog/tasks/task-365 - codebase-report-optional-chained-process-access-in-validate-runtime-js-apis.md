---
id: TASK-365
title: 'codebase: report optional-chained process access in validate-runtime-js-apis'
status: To Do
assignee: []
created_date: '2026-10-25 22:37'
labels:
  - codebase
  - validators
dependencies: []
priority: medium
ordinal: 368000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-231: the Go validate-runtime-js-apis check (pkg/ajan/codebasefx/runtime_js_apis.go) does not report `globalThis.process?.<member>` (optional chaining), so pkg/@eserstack/ajan/ffi/resolve.ts and wasm/resolve.ts read Node's process directly without a finding. Either route those reads through the standards runtime facade or record why ajan's resolver must read process directly, once the check catches the form.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The check reports process members reached with optional chaining, through globalThis and aliases, with tests
- [ ] #2 Every finding it then reports is fixed or carries a narrow exclude with a reason in .eser/manifest.yml
<!-- AC:END -->
