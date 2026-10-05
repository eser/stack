---
id: TASK-167
title: Keep purged noskills content restorable and add selective restore
status: To Do
assignee: []
created_date: '2026-10-05 00:58'
labels:
  - noskills
  - feature
dependencies: []
priority: low
ordinal: 167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the removed noskills TODOS.md ("Selective undo/restore from purge history"). `noskills purge` (commands/purge.ts) deletes concerns, specs, rules, workflow state, the manifest's noskills section and the agent integration outright through runtime.fs.remove. Nothing keeps a copy, so there is no history to restore from yet.

The feature: purge moves each removed category into a timestamped history entry (for example .eser/.state/purge-history/<timestamp>/<category>/), and a new `noskills purge restore` lists entries and restores the categories you choose.

Too large for the TODOS cleanup, and it needs these decisions first:
- whether --force keeps history;
- how many entries stay (coding-practices: every cache has a limit);
- what restore does when the target exists;
- how to restore the CLAUDE.md section and the settings.json hooks, which purge edits rather than deletes;
- how to serve users who purge in order to remove content from disk.

Decisions: purge keeps history by default and `--no-history` skips it (`--force` only skips the confirmation); the last 5 entries are kept; restore refuses to overwrite existing content unless `--overwrite` is passed; the CLAUDE.md section and settings.json hooks are restored by re-running sync, not by copying files; the README tells users who purge to remove content from disk to pass `--no-history`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 purge keeps each removed category in a timestamped history entry, bounded by a documented entry count, and a flag purges without keeping history
- [ ] #2 `noskills purge restore` lists history entries and restores the chosen categories, refusing to overwrite existing content unless asked
- [ ] #3 Tests cover purge then restore for each category, the history limit and the refusal to overwrite
- [ ] #4 The noskills README documents purge history and restore
- [ ] #5 deno task cli ok passes
<!-- AC:END -->
