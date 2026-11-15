---
id: TASK-398
title: 'cli: register native-function and go-workflow on workflows run'
status: Done
assignee: []
created_date: '2026-11-14 05:21'
updated_date: '2026-11-14 05:27'
labels:
  - typescript
  - cli
  - workflows
milestone: m-6
dependencies:
  - TASK-393
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 401000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The eser CLI registers the two tools that reach Go (TASK-393), so a manifest step can name native-function or go-workflow. The port to the native library loads on the first call only, through the shared client. TASK-393 left this open on purpose; the Go eser needs nothing because its workflows already run on the Go engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pkg/@eserstack/cli/native-tools.ts makes the two tools with ports on the shared native library, and main.ts adds them to the tools of the workflows command
- [x] #2 eser workflows run runs a manifest with a native-function step and a go-workflow step on the real library, and eser workflows list shows both
- [x] #3 A command that never names the tools does not load the library
- [x] #4 WIRING.md, the workflows README and the ADR say the CLI registers them
- [x] #5 The full gate passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/@eserstack/cli/native-tools.ts createNativeTools() returns native-function and go-workflow; main.ts adds them to getWorkflowTools() in the lazy load of the workflows command. The callers import @eserstack/ajan/ffi/functions and /ffi/client inside the call, so making the tools loads nothing (native-tools.test.ts checks client.getLib() is still null). No new dependency: the CLI already depends on ajan and workflows. native-tools.ffi.test.ts spawns bin.ts on a manifest with both steps (fails with the issue from both, passes on a clean tree, list shows both). Before the change the same manifest failed with Unknown tool 'native-function'. If the native library is the WASM build, the two tools fail with the dispatcher's unknown-name error, since functions and workflowRun are native only. Go eser needs nothing: its workflows run on the Go engine. Docs: WIRING.md, workflows README, ADR 0011 amendment. Full gate: 36 passed, exit 0, through the pnpm exec shim.
<!-- SECTION:NOTES:END -->
