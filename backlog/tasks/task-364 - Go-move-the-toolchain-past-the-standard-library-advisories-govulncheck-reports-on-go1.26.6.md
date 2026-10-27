---
id: TASK-364
title: >-
  Go: move the toolchain past the standard library advisories govulncheck
  reports on go1.26.6
status: Done
assignee: []
created_date: '2026-10-25 22:19'
updated_date: '2026-10-27 12:00'
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
- [x] #1 go.mod pins a toolchain release that fixes the reported standard library advisories, and the bridge module builds with it
- [x] #2 `pnpm cli go-vuln` exits 0, or every remaining finding is recorded with the reason it does not apply
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decisions 2026-10-27: raise the toolchain to the latest go1.26 patch, and raise golang.org/x/net to v0.60.0.

go.mod pins `toolchain go1.26.10`, the latest go1.26 release on that day, and the bridge module pkg/@eserstack/ajan now pins the same line; both modules build with it. With the toolchain alone, the standard library advisories were gone and govulncheck still reported GO-2026-6603, GO-2026-6611, GO-2026-6612 and GO-2026-6617 in golang.org/x/net v0.59.0, fixed in v0.60.0. Both modules now require golang.org/x/net v0.60.0, and the flake.nix vendorHash follows the new go.sum.

`pnpm cli go-vuln` exits 0. Its one remaining module-level finding, GO-2026-5932 (golang.org/x/crypto/openpgp is unmaintained, no fixed version), is not called: no package in either module imports golang.org/x/crypto/openpgp, so govulncheck lists it only because the module is required.

No CHANGELOG entry: the change needs nothing from users, and README's "Go 1.26 or higher" still holds.
<!-- SECTION:NOTES:END -->
