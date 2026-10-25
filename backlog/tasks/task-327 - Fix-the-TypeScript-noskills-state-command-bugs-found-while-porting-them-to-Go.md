---
id: TASK-327
title: Fix the TypeScript noskills state command bugs found while porting them to Go
status: Done
assignee: []
created_date: '2026-10-25 01:42'
updated_date: '2026-10-25 02:13'
labels:
  - noskills
  - bug
  - security
dependencies: []
priority: high
ordinal: 330000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-259; Go already behaves. Security: (3) pack.ts remote install writes paths built from untrusted pack content: :334 (manifest.name and rule path in the file name), :362 (concern.id), :380 (folderRules targetDir as ${root}/${targetDir}); (4) pack.ts uninstall :709-710 removes paths from packs.json unchecked; (5) pack.ts:171 and :199 fetch with no body size limit; (10) state/decision-ledger.ts:465 puts the CLI spec name into a path unchecked ('ledger ../x'). Others: (1) commands/learn.ts:90 interpolates Span objects, printing [object Object]; (2) rule.ts:35/87/166, concern.ts:36/67/157, pack.ts:60/513/661/755/897 and ledger.ts:81 call cmd.cmdPrefix() without loadCommandPrefix, so they print the default prefix; (6) sync/hooks.ts:111 throws on a settings.json holding null; (7) sync/adapters/opencode.ts:527 throws on an opencode.json holding null; (8) config.tools.length throws when the manifest has no tools list, after files are written (rule.ts:137, learn.ts:143/176, pack.ts:619/725); (9) sync/adapters/codex.ts:205 quotes TOML args without escaping, so a prefix with a quote or backslash writes invalid TOML.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The four security items have failing tests and are fixed first
- [x] #2 Every other item is fixed in TS with a test, or documented as intended
- [x] #3 The sync adapter and state command goldens still pass against TS and Go
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25, each with a failing test first.
Security:
- (3) commands/pack.ts remote install: checkPackFileName (as noskillsfx pack.go) refuses a pack name, rule name or concern id that is empty, '.' or '..', or holds a slash, a backslash or a NUL. projectFolderOf refuses a folderRules target that is absolute or leaves the project. Only the folderRules case actually wrote outside before (the others failed on missing directories); all four are now refused before any write. Test: pack.test.ts 'a remote pack cannot write outside its folders'.
- (4) uninstall goes through installedPackPaths, which leaves out packs.json entries that point outside their folders.
- (5) the pack.json and every pack file are read through readTextLimited (1 MiB, MAX_REMOTE_PACK_FILE_BYTES).
- (10) state/decision-ledger.ts: readLedger, readSummary and captureTransition refuse a spec name with a separator, a NUL or a dot segment ('ledger ../x' reads nothing).
Others:
- (1) learn list passes the Spans as separate arguments; no more '[object Object]'.
- (2) rule, concern, pack and ledger load the manifest's command before printing it.
- (6) sync/hooks.ts and (7) sync/adapters/opencode.ts treat a settings.json or opencode.json holding null, an array or a scalar as empty.
- (8) the 'tools.length' guards use '(config.tools ?? [])' in rule, learn and pack, and also in status.ts and purge-restore.ts, which had the same pattern.
- (9) sync/adapters/codex.ts writes the MCP command words as TOML basic strings (backslash, quote and control characters escaped). Fixed in Go too (noskillsfx/sync_codex.go tomlBasicString, TestCodexMcpTomlEscapesTheCommand); a plain prefix gives the same bytes as before.
Tests: commands/pack.test.ts (6), commands/state-commands.test.ts (3), decision-ledger.test.ts, hooks.test.ts, opencode.test.ts and codex.test.ts. deno test pkg/@eserstack/noskills: 503 passed; lint clean.
AC #3 (goldens) waits until the concurrent TASK-258.1/259.1 work compiles: re-record state_commands from TS (the prefix fix may change its text) and replay it against Go.

2026-10-25: rtk make ok and deno task cli ok passed with all agent work in place. AC #3: state_commands was re-recorded from TS after the fixes. It came out byte-identical (the fixture manifests use the default command), and every golden replays against Go.
<!-- SECTION:NOTES:END -->
