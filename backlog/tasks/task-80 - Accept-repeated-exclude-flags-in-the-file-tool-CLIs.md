---
id: TASK-80
title: Accept repeated --exclude flags in the file-tool CLIs
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - codebase
  - bug
dependencies: []
references:
  - pkg/@eserstack/codebase/file-tool.ts
priority: low
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
createFileTool's standalone main (pkg/@eserstack/codebase/file-tool.ts:334-340) parses `exclude` as a plain string flag, so `--exclude a --exclude b` keeps only the last value. A validator therefore cannot run standalone with the manifest's exclude list, and users fall back to `eser workflows run --only <step>`. Rule: architecture-guidelines: Public API and CLI Surface.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 parseArgs collects every --exclude value
- [x] #2 The help text says the flag can be repeated
- [x] #3 A test passes two --exclude flags and both apply
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

codebase: file-tool.ts parses with collect: ["exclude"], and handleCli normalizes the flag with toStringList and rejects an empty pattern. The help text says the flag can be repeated, and the README example uses two --exclude flags. file-tool.test.ts covers repeated flags, the --exclude= form, a single flag, no flag and an empty pattern.
<!-- SECTION:NOTES:END -->
