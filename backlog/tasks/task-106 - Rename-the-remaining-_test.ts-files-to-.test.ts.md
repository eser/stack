---
id: TASK-106
title: Rename the remaining _test.ts files to .test.ts
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - workflows
  - kit
  - codebase
  - test
dependencies: []
references:
  - pkg/@eserstack/workflows
  - pkg/@eserstack/kit/commands
  - pkg/@eserstack/kit/recipes
priority: low
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The testing rule names test files <module>.test.ts. workflows has five files in the _test.ts form (builder_test.ts, composition_test.ts, engine_test.ts, loader_test.ts, registry_test.ts), kit has fifteen under commands/ and recipes/, and codebase has one. Rule: javascript-practices: Test Files and Runner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No _test.ts files remain under pkg/@eserstack
- [x] #2 All renamed tests still run in deno task cli test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

codebase: The codebase package has no _test.ts files left: validate-licenses_test.ts was renamed to validate-licenses.test.ts with namespace imports, and nothing in the repo refers to the old name. The workflows and kit packages rename their own files in their units.

ai-workflows: Verified: `find pkg/@eserstack -name '*_test.ts'` returns nothing. The five renamed workflows files (builder, composition, engine, loader and registry .test.ts) run in deno test. The workflows suite passes as part of the 258 tests.

kit: Kit's part is done, as the unit file scopes it. No _test.ts file is left in kit. Comparing each HEAD _test.ts with its .test.ts, every renamed file has the same or a higher test count, and the higher counts come from the new tests. No reference to the old file names is left outside backlog/ and etc/. Repo-wide, five workflows files remain (builder, composition, engine, loader, registry), and the workflows unit owns them.
<!-- SECTION:NOTES:END -->
