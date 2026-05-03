# @eserstack/workflows — FFI Wiring Notes

## Go FFI path

`EserAjanWorkflowRun` supports two modes:

| Field | Mode |
|-------|------|
| `event` | Run all workflows whose `on` list includes the event |
| `workflowId` | Run a single named workflow by ID |

Both modes use only the built-in `shell` tool on the Go side.

## TS_ONLY_BY_DESIGN: custom tool injection

`run.ts` accepts `cliOptions?.tools: WorkflowTool[]` injected by the CLI dispatcher.
These additional tools (e.g. codebase validators from `@eserstack/codebase`) register
duck-typed step handlers that Go cannot replicate without recompilation.

**Decision:** custom tool injection is `TS_ONLY_BY_DESIGN`. When `cliOptions.tools` is
provided, the FFI path is skipped entirely and the TypeScript engine runs instead.

The FFI path is attempted only when `cliOptions.tools === undefined` (the common case
for `precommit`, `commitmsg`, `prepush`, and named-workflow runs from the CLI).
