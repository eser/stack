---
id: TASK-152
title: Show the DI container's entries in the REPL instead of every package namespace
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-24 17:54'
labels:
  - repl
  - feature
dependencies: []
references:
  - repl-init.ts
  - pkg/@eserstack/mod.ts
priority: low
ordinal: 152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
repl-init.ts copies every namespace from pkg/@eserstack/mod.ts onto the REPL's globals. The owner's note asks to expose the dependency injection container's entries instead, and repl-init.ts:14 carries it as TODO(TASK-NEW).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The REPL lists and exposes the DI container's entries
- [x] #2 The TODO(TASK-NEW) at repl-init.ts:14 is replaced with this task's id or removed with the change
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

tooling: Checked in a real `deno repl --allow-all --unstable-bundle --eval-file=./repl-init.ts` session. The banner shows version 4.5.2, and the container list shows eserstack and packageConfig. `typeof fp` is "undefined" and `typeof eserstack.fp` is "object". After `eserstack.di.registry.set("answer", 42); vars()` the list includes answer, and `answer` returns 42. globalThis.crypto is unchanged. ServiceRegistry.descriptors and services.get exist in pkg/@eserstack/di, and the root barrel re-exports ./di/mod.ts, so eserstack.di is the same registry the REPL reads. Decision kept from stage 1: the DI container now decides what the REPL predefines, and the package barrel is one `eserstack` entry in it.

2026-10-24: closed as superseded by TASK-182 (M0-T9), which deleted repl-init.ts, the pkg/@eserstack/mod.ts barrel and the repl manifest script, the files this task targeted. Nothing was implemented here.
<!-- SECTION:NOTES:END -->
