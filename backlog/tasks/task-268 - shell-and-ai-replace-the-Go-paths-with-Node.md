---
id: TASK-268
title: 'shell and ai: keep the Go paths and move their remaining TypeScript logic to Go'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - go-delegation
  - shell
  - ai
milestone: m-6
dependencies:
  - TASK-266
  - TASK-279
priority: medium
ordinal: 268000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision go-ts-boundary, shell and ai keep their Go paths through the bridge, with blocking calls in the M2-T8 workers. This task moves what still exists only in TypeScript to shellfx and aifx, one commit per package.

shell:
- exec, the PTY and the TUI keypress reader stay on shellfx (exec-go.ts, child-go.ts, pty-go.ts, keypress-go.ts). The process-group kill in exec/process-group.ts and the runtime spawn fallback in exec/command.ts are TypeScript duplicates of shellfx: delete them unless they are a kept fallback.
- Audit exec/parser.ts, args/ and completions/ and move the logic that has or can have a shellfx counterpart. The tui widgets and vterm stay in TypeScript as UI code.

ai:
- adapters/ajan-bridge.ts on aifx is the main path, with aifx's providers on net/http after TASK-279 (decision-55). For each TypeScript provider adapter (anthropic, openai, gemini, vertexai, ollama, claude-code, kiro, opencode and cli-shared), check that aifx covers the provider with the same options, tool calls and errors, and move what aifx lacks into aifx.
- Delete a TypeScript adapter once aifx covers its provider. aifx stays out of the WASM profile (decision-45), so on windows/arm64 and under `--no-experimental-ffi` the AI calls answer UNSUPPORTED_IN_WASM; that is not a reason to keep a TypeScript adapter. Keep one only as a listed fallback for browser code. Remove the per-provider selection in adapters/mod.ts:62-80 only if no TypeScript adapter remains.

Write an audit table in a new shell/WIRING.md and ai/WIRING.md that marks every export as Go, moved or TS, with the reason for TS, and lists each kept fallback. Both packages keep @eserstack/ajan as a dependency.

Decisions this task waits on: decision-22 (Where the Go and TypeScript boundary sits); decision-45 (ajan WASM fallback).

Plan key: M6-T2. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 shell/WIRING.md and ai/WIRING.md exist and mark every export as Go, moved or TS, with a reason on every TS row and a list of kept fallbacks
- [ ] #2 Process-group kill tests pass through the shellfx exec path on Linux and macOS, and Windows behavior is tested in CI
- [ ] #3 For each provider that aifx covers, the fake-provider tests pass through adapters/ajan-bridge.ts, and every TypeScript adapter file still in ai/adapters is named in ai/WIRING.md as a kept fallback
- [ ] #4 Every function moved to shellfx or aifx has a Go test and a TS test that reaches it through the bridge
- [ ] #5 The shell and ai *.ffi.test.ts suites and `eser ok` pass
<!-- AC:END -->
