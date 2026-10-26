---
id: TASK-179
title: 'laroux-react: remove .tsx so the package loads under Node'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 17:32'
labels:
  - laroux-react
  - frontend
  - erasable-syntax
milestone: m-0
dependencies:
  - TASK-174
priority: high
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rename hmr-client.tsx and smart-refresh.tsx to .ts; neither contains JSX. Rewrite the six JSX files as .ts using React.createElement: span-renderer, the client/bootstrap entry, error-boundary, error-overlay, runtime/image/image and runtime/navigation/link, about 46 JSX roots in all. Update package.json exports and the 26 relative imports that name a .tsx file, including test imports in laroux-bundler and laroux-server. Keep client/bootstrap/index.ts as the bootstrap source entry that laroux-bundler copies (rsc-client-entry.ts:183).

Decisions this task waits on: decision-17 (How laroux-react's JSX runs under Node).

Keep the rewrite mechanical: client/bootstrap, hmr-client and smart-refresh are replaced in track L, so they get no redesign. Tests for files that track L deletes (doc-3 section 27) get the tag `track-l-delete` in their test name, so TASK-317 can find them.

Plan key: M0-T6. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No .tsx file remains in pkg/@eserstack/laroux-react
- [x] #2 Every laroux-react export imports under plain `node` 26
- [x] #3 The laroux tests produce unchanged SSR output, and the client bundle builds with rolldown
- [x] #4 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. A TypeScript-AST codemod rewrote every JSX node of span-renderer, client/bootstrap/entry, error-boundary, error-overlay, runtime/image/image and runtime/navigation/link as React.createElement calls (React's JSX text whitespace rule, entities decoded, fragments as React.Fragment, spread props and children kept) and left every other byte of the files as it was; image.ts gained import * as React and link.ts's type-only React import became a value import. hmr-client and smart-refresh had no JSX and were renamed. No .tsx file remains in laroux-react. Updated: laroux-react mod.ts, client/bootstrap/index.ts, span-renderer.test.ts and the other test imports, package.json exports (./span-renderer), deno.extra.json publish include (span-renderer.ts; the two .tsx globs removed), laroux-bundler rsc-client-entry.ts BOOTSTRAP_ENTRY_FILE and BOOTSTRAP_SOURCE_FILES, its test and README, and a comment in laroux-server inline-rsc-emitter.ts. The generated _client-entry.tsx in an app's dist keeps its name. Test counts before and after: laroux-react 109, laroux-server 103, laroux-bundler 42 (its rsc-client-entry test bundles the client entry with the copied bootstrap files), laroux 156, all passing, so SSR output is unchanged where tests cover it. All six laroux-react exports import under plain node 26.5.1. protocol.test.ts (13) and client.test.ts (19) test names now start with 'track-l-delete: ' (doc-3 section 27); client/bootstrap has no tests of its own. deno task cli ok passed.
<!-- SECTION:NOTES:END -->
