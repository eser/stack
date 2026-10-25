---
id: TASK-194
title: Prepare a last Deno-era release with JSR and updater migration notices
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 17:13'
labels:
  - release
  - jsr
  - docs
  - migration
milestone: m-0
dependencies:
  - TASK-174
priority: medium
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision jsr-deprecation-notice, while Deno is still the toolchain:
- Add a short notice at the top of every published library README and the root README. It says that from the next major the package is on npm under the same name (per decision jsr-publishing) and that JSR stays frozen.
- Make the TS update handler (codebase/cli-system/handlers/update.ts:124-155) fail closed with a readable npm or install.sh pointer when the expected archive is missing, instead of the checksum and download error. Binaries that update to this release then get a clear message later.
- Make the eser CLI print a one-line notice when it runs from a `deno install jsr:@eserstack/cli` install.
Prepare 4.5.3 with the release command in dry-run mode, run preflight, and hand the owner a checklist. The owner releases it before M1-T1 starts, because no later release can publish to JSR without Deno. If the owner declines the decision, close this task as not needed.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only); decision-6 (Give JSR consumers a signal before freezing it).

Plan key: M0-T21. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every library README on the JSR page shows the notice in a `deno publish --dry-run`
- [x] #2 A test covers the missing-archive message in the TS update handler
- [x] #3 `deno task cli ok` and `deno task cli preflight` pass; the checklist is in the task; no tag, push or publish was made
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. README notice at the top of the 39 JSR library READMEs and the root README (jsx-runtime and laroux-runtime say they are removed in 5.0.0 and not published to npm, per decision-18; cli names the npm package eser). deno publish --dry-run in pkg/@eserstack/fp lists README.md, and the gate's deno-publish-check passed for every package. Update handler: a 404 for the release archive now prints missingArchiveMessage (release tag, archive name, npm install -g <package>, and the install.sh one-liner, or the install.ps1 scriptblock form with -Product on Windows) and exits 1, instead of the HTTP error; tests in handlers/update.test.ts. The eser CLI prints a one-line stderr notice when its main module is served from jsr.io (cli/main.ts jsrInstallNotice, test in cli/main.test.ts). deno task cli ok and deno task cli preflight passed (all 11 preflight steps). The release dry-run was not run: release() refuses a dirty working tree, and this session's changes are not committed. No tag, push or publish was made.

Owner checklist for 4.5.3 (before M1-T1 starts):
1. Review and commit the working tree (this session's changes are uncommitted).
2. Run deno task cli ok and deno task cli preflight on the clean tree.
3. Run deno task cli codebase release patch --dry-run and check the 4.5.2 -> 4.5.3 bump and the CHANGELOG entry (it should mention the JSR freeze notice and the updater message).
4. Release 4.5.3 with deno task cli codebase release patch when ready; it commits, pushes and tags, and the tag publishes to JSR and npm.
5. After the release run: check one JSR package page shows the notice, and that an installed 4.5.2 binary updates to 4.5.3.
<!-- SECTION:NOTES:END -->
