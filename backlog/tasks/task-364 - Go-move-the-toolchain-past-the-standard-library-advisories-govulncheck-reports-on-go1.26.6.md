---
id: TASK-364
title: >-
  Go: move the toolchain past the standard library advisories govulncheck
  reports on go1.26.6
status: To Do
assignee: []
created_date: '2026-10-25 22:19'
labels:
  - go
  - security
dependencies: []
priority: high
ordinal: 367000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-230: `pnpm cli go-vuln` (govulncheck on both Go modules) exits 2 with 13 Go standard library advisories, GO-2026-6809 among them, on the pinned `toolchain go1.26.6` in go.mod. The bridge module pkg/@eserstack/ajan has no toolchain line of its own. Raising the toolchain is a dependency change for the owner to approve.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 go.mod pins a toolchain release that fixes the reported standard library advisories, and the bridge module builds with it
- [ ] #2 `pnpm cli go-vuln` exits 0, or every remaining finding is recorded with the reason it does not apply
<!-- AC:END -->
