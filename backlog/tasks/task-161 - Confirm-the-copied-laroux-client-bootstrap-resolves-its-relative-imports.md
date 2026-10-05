---
id: TASK-161
title: Confirm the copied laroux client bootstrap resolves its relative imports
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - laroux-bundler
  - bug
dependencies: []
references:
  - pkg/@eserstack/laroux-bundler/adapters/react/rsc-client-entry.ts
  - pkg/@eserstack/laroux-react/client/bootstrap/entry.tsx
priority: high
ordinal: 161000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/laroux-bundler/adapters/react/rsc-client-entry.ts copyBootstrapFiles copies only BOOTSTRAP_FILES (entry.tsx and seven siblings) into the dist directory, but entry.tsx imports ../../client.ts, ../../protocol.ts and, since TASK-66, ../../runtime/image/fallback.ts relative to its place in laroux-react. After the copy those paths point outside the package, and nothing in the bundler rewrites them. The value import from ../../client.ts was already there at HEAD, so either a resolver handles it somewhere or production client builds are broken. Found by reading the code, not by running a build.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test builds the client entry of a minimal laroux app with the copied bootstrap and passes
- [x] #2 Either the copy keeps the relative layout, or entry.tsx is bundled from its package location
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

laroux: Checked the code and the tests: rsc-client-entry.ts copies the laroux-react files with their package layout to <distDir>/_laroux-react/. The new link-navigation.ts is on the copy list. rsc-client-entry.test.ts and system.test.ts bundle and build a minimal app; both pass.
<!-- SECTION:NOTES:END -->
