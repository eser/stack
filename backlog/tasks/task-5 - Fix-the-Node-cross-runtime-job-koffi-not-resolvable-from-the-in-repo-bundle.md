---
id: TASK-5
title: 'Fix the Node cross-runtime job: koffi not resolvable from the in-repo bundle'
status: Done
assignee: []
created_date: '2026-09-16 15:02'
updated_date: '2026-09-17 16:12'
labels:
  - ci
dependencies: []
references:
  - .github/workflows/build.yml
  - etc/scripts/preflight-npm-consumer.ts
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cross-Runtime Test (node on ubuntu-24.04-arm / macos-latest) has been red on every main run, hidden by continue-on-error. The step 'Verify FFI — eser ajan version' runs the freshly built pkg/@eserstack/cli/dist bundle in place under Node and fails with "Cannot find package 'koffi' imported from .../cli/dist/chunks/...". koffi is an esbuild external, declared as a dependency of the published package, but inside the pnpm workspace it is only installed under @eserstack/ajan, so Node walking up from cli/dist never finds it. Real installs are fine (the no-Deno smoke test and the preflight consumer install prove that); the job tests the bundle in a layout no user has.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both Node entries of the cross-runtime matrix pass on main
- [x] #2 The job exercises the bundle the way a user gets it (packed tarball installed outside the repo, reusing preflight-npm-consumer.ts) rather than running dist/ in place inside the workspace
- [x] #3 continue-on-error is removed for the Node entries once they are green, so a regression is visible again
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
preflight-npm-consumer.ts gained --runtime=node|bun (invokes the installed eser.js with that runtime explicitly) and --require-native (fails unless eser ajan version loads the library and reports the bundle version). The cross-runtime job now runs that script for Node and Bun with ESER_AJAN_LIB_PATH pointing at the freshly built library; Deno keeps running from source. continue-on-error removed for the whole matrix. Verified locally on macOS arm64 under Node 26 and Bun, and confirmed on main by run 35244170736 (2026-09-17): all six matrix entries green, no continue-on-error masking.
<!-- SECTION:NOTES:END -->
