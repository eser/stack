---
id: TASK-259
title: Move the noskills state commands and sync adapters to Go
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 01:42'
labels:
  - go
  - noskills
milestone: m-4
dependencies:
  - TASK-257
  - TASK-258
priority: medium
ordinal: 259000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port purge and purge-restore (the TASK-167 selective restore), ledger, learn, rule, concern and pack, with the default concerns and packs embedded through go:embed. Port the sync adapters (3,679 TS lines) for every supported agent tool.

Plan key: M4-T4. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Golden fixtures pass, including selective restore
- [x] #2 Embedded defaults match the TS defaults byte for byte, and each adapter writes byte-identical files for the fixtures
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done by a delegated agent; make ok and deno task cli ok passed here).
Now in Go, with no forwarding (checked with NOSKILLS_NO_FORWARD=1):
- purge (per category or --force; history kept unless --no-history; newest 5 entries) and purge restore (latest or an entry id, selective categories, --overwrite, interactive select);
- ledger (and spec <name> ledger, --format=measurement-draft), learn (list, remove, promote; spec <name> learn with --rule, --type, --severity), rule (add, list, promote), concern (add, remove, list, --json), pack (list, install built-in and github:, uninstall, inspect, search);
- sync (runs init); init writes the tool files itself through noskillsfx.SyncAll, with no TS call.
- ledger -o markdown/text still forwards (TASK-258.1).
The adapters (claude-code, cursor, kiro, copilot, windsurf, opencode, codex, copilot-cli) are in noskillsfx/sync_*.go. Packs are embedded in defaults/packs next to defaults/concerns.
AC #1: TestReplay passes sync (un-skipped, 2/2), purge_restore 6/6, purge_selective 25/25 (selective restore, refused overwrite, --overwrite, unknown category or entry, --no-history, the 5-entry limit), state_commands 57/57, init_active_spec 4/4, init_bare and init_tools, and every older scenario.
AC #2: TestEmbeddedPacksMatchTheTypeScriptDefaults (14 files byte for byte) and TestPackRulesMatchTheTypeScriptConstants. TestSyncAdaptersMatchTypeScript and TestSyncAdaptersLive (TS syncAll against Go SyncAll on PATH-node) are byte-identical over 36 cases: 4 fixtures (empty, user_content, rules_and_specs, malformed), each adapter alone and all 8 together, and an unknown tool id.
Go differs on purpose:
- learn list prints the icon and type (TS prints [object Object]);
- messages use the manifest's command prefix;
- purge moves the manifest section as text;
- remote packs and folder rules cannot write outside their folders (os.Root);
- the registry fetch refuses internal addresses at dial time and caps bodies at 1 MiB;
- a null settings.json or opencode.json reads as empty;
- a manifest without tools means no sync.
TS bugs are filed as a follow-up (several are security issues in pack install).
<!-- SECTION:NOTES:END -->
