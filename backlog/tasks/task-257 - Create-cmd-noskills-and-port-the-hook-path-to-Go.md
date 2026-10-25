---
id: TASK-257
title: Create cmd/noskills and port the hook path to Go
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 23:23'
labels:
  - go
  - noskills
  - hooks
milestone: m-4
dependencies:
  - TASK-256
priority: high
ordinal: 257000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision noskills-binary-layout, add cmd/noskills on clifx and noskillsfx. Port invoke-hook.ts (1,051 lines), hook-decisions.ts (1,153), commands/git-wrapper.ts (286), agents/guards/git.ts (588) and sync/hook-commands.ts, keeping the user Deno project support allowed by decision user-deno-projects. Newly generated hooks call the local binary instead of `npx eser@latest noskills`; existing hooks keep working through the M3-T11 launcher.

Decisions this task waits on: decision-12 (Keep supporting users whose own projects use Deno); decision-25 (noskills as its own binary or as part of noskills-server).

Plan key: M4-T2. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Golden hook fixtures pass against the Go binary
- [x] #2 A Go benchmark records hook startup under 50 ms on the reference machine
- [x] #3 Generated hook configs call the Go binary, and the TASK-163 timeout workaround is documented as no longer needed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done by a delegated agent, checked here; make ok and deno task cli ok passed).
cmd/noskills is on clifx and noskillsfx. invoke-hook (every event and dialect), version and help run in Go; every other command is forwarded to the TS CLI (NOSKILLS_TS_CLI, ESER_PLUGIN_PATH, then npx --yes noskills@<version>). session-start runs in Go for IDLE and forwards otherwise.
Ported:
- git_guard.go (agents/guards/git.ts); git_wrapper.go (byte-identical script)
- hook_decisions.go and hook_ask_token.go (hook-decisions.ts); hook_handlers.go and cmd/noskills/hook.go (invoke-hook.ts)
- hook_commands.go (sync/hook-commands.ts); hook_logs.go (iteration logs)
- hook_state.go and hook_rules.go (the readers of persistence, engine and folder-rules); hook_idle.go (IDLE compile, default concerns embedded)
- js_json.go, js_text.go and yaml_core.go reproduce JSON.stringify/parse, JS whitespace and core-schema YAML.
clifx gained a backward-compatible RawArgs option, so git-exec arguments reach the handler unparsed. make build also builds bin/noskills.
AC #1:
- hooks.json steps 2-5 pass (4/4).
- The new golden/testdata/golden/hook_events.json (40 steps, recorded from the TS CLI, stored as deltas): steps 2-39 pass (38/38), with NOSKILLS_NO_FORWARD=1 so nothing falls back to TS.
- hook_parity_test.go replays 738 commands from the TS tests over 17 predicates plus 147 structured cases: all pass.
- spec_lifecycle, purge_restore and sync are skipped with a message naming TASK-258/259.
AC #2: BenchmarkHookStartup 3.87 ms (git-write denial) and 3.52 ms (gated file edit); TestHookStartupBudget fails at a 50 ms median. The TS hook under node takes about 126 ms.
AC #3:
- The binary sets NOSKILLS_CLI_PREFIX to itself when forwarding, and output/cmd.ts reads it first, so 'noskills init' through the binary writes 'command: noskills' and every .claude/settings.json hook becomes 'noskills invoke-hook <event>'. Checked end to end: that hook denied a git push with exit 2.
- The TASK-163 workaround (30 s timeout, npx warning) is documented as not needed for Go hooks: noskills README 'When the hook is slow', README-HOW, and comments in hook-commands.ts and Go HookTimeoutSeconds. The value stays 30 s for npx-based hooks.
Fixed here, found by the agent: the Go eser refused any .eser/manifest.yml with a noskills: section ('unknown key'). The TASK-243 schema modelled the noskills keys at the top level, but TS and Go both write them under noskills:. The 10 keys plus the missing 'validate' now sit in a noskills object, in both pkg/ajan/workflowfx/manifest_schema.json and docs/schema/manifest.json, which are kept identical. Test: TestParseManifest_NoskillsSection. Without this, TASK-254 could not keep old 'npx eser@latest noskills' hooks working.
Go behaviour that differs from TS:
- directory listings are sorted;
- no legacy-layout migration (TASK-258.1);
- folder rules are read through os.OpenRoot, so '..' and symlinks cannot leave the root;
- spec names with slashes are rejected;
- state.json is rewritten atomically;
- an explicit !!str tag is not honoured;
- an empty NOSKILLS_REAL_GIT resolves from PATH.
TS bugs found are filed as a follow-up task. Note for TASK-261: once the npm noskills package becomes the Go launcher, the binary's 'npx noskills@<version>' fallback would loop back to itself, so TASK-261 must change that lookup.
<!-- SECTION:NOTES:END -->
