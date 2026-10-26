---
id: TASK-84
title: Make Link navigate on the client when a server component renders it
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-15 19:34'
labels:
  - laroux-react
  - laroux-bundler
  - bug
dependencies: []
references:
  - pkg/@eserstack/laroux-react/runtime/navigation/link.tsx
  - pkg/@eserstack/laroux-react/README.md
  - pkg/@eserstack/codebase/directive-analysis
  - .agents/skills/frontend-practices/references/laroux.md
priority: medium
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
laroux treats only "use client" files under the app's srcDir as client components, because @eserstack/codebase/directive-analysis walks srcDir and skips node_modules. A Link from @eserstack/laroux-react (runtime/navigation/link.tsx) rendered inside a server component is therefore called as a plain function by laroux-server's rsc-flight-renderer, its onClick is dropped, and every click loads the whole page. laroux-react README.md:70 documents this as a limitation. Fix it by registering "use client" modules exported by dependencies as client references, or by rendering marker data attributes that the client bootstrap intercepts, as Image fallbacks do with data-laroux-fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Link rendered by a server component navigates on the client, shown by a test
- [x] #2 The limitation is removed from the laroux-react README and from frontend-practices references/laroux.md
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

AC #2 is met. laroux.md and the laroux-react README describe server-rendered Link client navigation through data-laroux-link/data-laroux-scroll and no longer state the limitation. The verifier also corrected the list of links left to the browser in both files to match analyzeNavigation: every scheme and protocol-relative URLs, not only http(s)/mailto/hash. AC #1 belongs to the laroux unit; AC #3 is the orchestrator's gate.
<!-- SECTION:NOTES:END -->
