---
id: TASK-153
title: >-
  Add timeouts to the network and subprocess calls in the etc/scripts release
  tooling
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - release
  - robustness
dependencies: []
references:
  - etc/scripts/update-nix-hashes.ts
  - etc/scripts/update-homebrew-formula.ts
  - etc/scripts/preflight-npm-consumer.ts
priority: low
ordinal: 153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
fetch in etc/scripts/update-nix-hashes.ts:28 and update-homebrew-formula.ts:213, the git clone, commit and push calls in update-homebrew-formula.ts:156, and the npm pack, install and runtime calls in preflight-npm-consumer.ts:48 have no timeout. A stalled registry or git remote holds the release job until the job-level limit. Rule: coding-practices: External Calls Have Timeouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fetch and Deno.Command calls pass AbortSignal.timeout with named *_TIMEOUT_MS constants
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

tooling: Checked: the only fetch and Deno.Command sites in etc/scripts (update-nix-hashes.ts:40, update-homebrew-formula.ts:178 and :253, preflight-npm-consumer.ts:68) all pass AbortSignal.timeout. The constants are ARCHIVE_DOWNLOAD_TIMEOUT_MS, SHA256SUMS_DOWNLOAD_TIMEOUT_MS, GIT_REMOTE_TIMEOUT_MS, GIT_LOCAL_TIMEOUT_MS, NPM_PACK_TIMEOUT_MS, NPM_INSTALL_TIMEOUT_MS and ESER_COMMAND_TIMEOUT_MS, and every caller passes one of them. I tested the abort behavior on Deno 2.9.7: output() resolved with success false, code 143 and SIGTERM, so the `!success && signal.aborted` check works. Both --dry-run modes ran cleanly. The 3 new redactUrlCredentials tests pass. I changed the preflight timeout hint so it no longer names the npm registry for eser commands.
<!-- SECTION:NOTES:END -->
