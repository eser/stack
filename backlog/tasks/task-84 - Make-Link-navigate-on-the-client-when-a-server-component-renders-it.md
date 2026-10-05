---
id: TASK-84
title: Make Link navigate on the client when a server component renders it
status: To Do
assignee: []
created_date: '2026-10-04 20:51'
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
- [ ] #1 A Link rendered by a server component navigates on the client, shown by a test
- [ ] #2 The limitation is removed from the laroux-react README and from frontend-practices references/laroux.md
- [ ] #3 deno task cli ok passes
<!-- AC:END -->
