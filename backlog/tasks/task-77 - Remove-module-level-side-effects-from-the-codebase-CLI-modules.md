---
id: TASK-77
title: Remove module-level side effects from the codebase CLI modules
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - codebase
  - refactor
dependencies: []
references:
  - pkg/@eserstack/codebase/versions.ts
  - pkg/@eserstack/codebase/validate-commit-msg.ts
  - pkg/@eserstack/codebase/cli-support.ts
  - pkg/@eserstack/codebase/file-tool.ts
priority: medium
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
versions.ts:45, release.ts:49, gh.ts:22, gh-contributors.ts:36, release-tag.ts:32, release-notes.ts:49 and changelog-gen.ts:38 call cliSupport.createCliContext() at module scope. validate-commit-msg.ts:25, validate-docs.ts, validate-mod-exports.ts, validate-export-names.ts, validate-package-configs.ts and validate-circular-deps.ts call the deprecated createCliOutput() at module scope, and validate-commit-msg.ts:23 starts ffiClient.ensureLib() on import without awaiting or owning the promise. Create these lazily, as file-tool.ts does with getCliContext. Rules: design-principles: Module-Level Side Effects; coding-practices: Owned Asynchronous Work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Importing any of these modules creates no CLI context or output and starts no promise
- [x] #2 createCliOutput has no remaining callers in the package
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

codebase: Verified independently. getCliContext in cli-support.ts creates the context on first use and reuses it after that. No module-scope createCliContext, createCliOutput or ensureLib calls remain: every hit is inside a function or an import.meta.main block. The temporary import test with sanitizers on passed and the bridge stayed unloaded. createCliOutput keeps only its deprecated definition. validate-commit-msg main and the validation registry adapter await ffiClient.ensureLib() before the synchronous check, so the native validator still runs. The shared output is closed only by commitmsg.ts's standalone entry block, at the end of the process; doctor, info, install and the other handlers that close an output create their own.
<!-- SECTION:NOTES:END -->
