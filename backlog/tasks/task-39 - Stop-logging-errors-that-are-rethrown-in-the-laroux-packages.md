---
id: TASK-39
title: Stop logging errors that are rethrown in the laroux packages
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - laroux
  - errors
dependencies: []
references:
  - pkg/@eserstack/laroux-bundler/system.ts
  - pkg/@eserstack/laroux-react/client/bootstrap/entry.tsx
priority: medium
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nine sites log an error and then throw it, so one failure is reported at every layer: laroux-server/domain/action-registry.ts:91-92, laroux-bundler/system.ts:1319 and :1838, laroux-bundler/adapters/lightningcss/css-processor.ts:75, laroux-react/client/bootstrap/entry.tsx:175, :245, :627 and the remaining sites in those files. Rule: coding-practices: Handle Each Error Once.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each site either handles the error (and logs) or rethrows it with context (and does not log)
- [x] #2 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

laroux-react: Verified in entry.tsx. callServer wraps fetch and JSON failures with { cause } and the action id, and does not log. customModuleLoader and hydrateFromStreamingOptimal no longer log and rethrow. bootstrap() handles a hydration failure once with .catch() and falls back to CSR. The remaining catches in the package handle the error and log it once. The laroux-server and laroux-bundler sites belong to other units.

laroux-bundler: laroux-bundler part only. No catch block or throw site in the package both logs and throws. Every rethrow carries { cause }. The handlers log once through describeError. The laroux-server and laroux-react sites belong to other units, so TASK-39 as a whole stays open until those units finish. Verifier fix: exported BuildIsolationError and ChunkManifestError from mod.ts and domain/mod.ts. They are thrown by the public validateBuildIsolation and generateChunkManifest, and callers could not identify them before.

laroux-server: Checked the laroux-server sites. invokeAction throws ServerActionError with actionId and cause and does not log. handleUncaughtError awaits logger.error (which returns a Promise) and then exits(1) without rethrowing. npm-build wraps esbuild errors with their cause. I scanned every catch block: the only rethrows left are the NotFoundError passthroughs in server.ts serveStatic/servePublicAsset, which do not log. renderRSC logs and returns an error stream, so it handles the error and does not rethrow. Tests: action-registry.test.ts and the handleUncaughtError test.
<!-- SECTION:NOTES:END -->
