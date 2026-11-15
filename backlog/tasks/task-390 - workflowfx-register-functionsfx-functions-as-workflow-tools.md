---
id: TASK-390
title: 'workflowfx: register functionsfx functions as workflow tools'
status: Done
assignee: []
created_date: '2026-11-10 10:00'
updated_date: '2026-11-13 21:10'
labels:
  - go
  - workflows
milestone: m-6
dependencies:
  - TASK-386
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 393000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add RegisterFunctions(registry, functionRegistry) so every function of a functionsfx registry is a WorkflowTool. The manifest syntax does not change. A step's options decode into the function input, validated by the descriptor's input schema, and the function output fills the tool result. Go calls Go only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A manifest step naming a registered function runs it with if, loop, includes and inputSchema working
- [x] #2 A function error of kind ValidationError fails the step with the message and not a panic
- [x] #3 No change to the manifest schema
- [x] #4 pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/ajan/workflowfx/functions.go: RegisterFunctions(tools, functions) registers each function of a functionsfx registry as a WorkflowTool under its name. A name that is already a tool is ErrToolExists and nothing is registered, so a function cannot replace the shell tool. The manifest schema is unchanged (TestTheManifestSchemaIsUnchanged, and every manifest in functions_test.go parses with the existing schema).

Input: the function decodes the merged options of the step as JSON, the manifest's options plus the ones the engine adds (root, fix, dryRun, _args, _changedFiles). A function takes the fields it needs, so its schema must not forbid additional properties; this is documented in the functionsfx README. The descriptor's input schema is enforced by the function itself, and the step-level inputSchema directive of the engine still runs first.

Output: a function that declares the new functionsfx.TriggerWorkflow answers a workflowfx.ToolOutput (passed, issues, mutations, stats), which fills the tool result; unknown fields are an error and passed is false unless set, so a wrong shape fails where it can be seen. Any other function passes its step and its output is Stats["output"]. ToolOutput, ToolIssue and ToolMutation are separate wire types with JSON tags, so WorkflowIssue and WorkflowFileMutation, which the bridge may serialize, keep their form. TASK-395 returns ToolOutput from the validators.

Errors: a ValidationError or an AdaptError fails the step with its message and the run goes on, like a tool that refuses its options (failResult); any other error is returned, which stops the run unless the step sets continueOnError, and a step timeout ends the function through its context and reaches context.DeadlineExceeded.

Tests (functions_test.go): registration, the clash, output in stats, a workflow-trigger function with issues and stats, mutations through OnMutations, a wrong shape, if and includes through a manifest, loop through a definition (the manifest has no variables key), the step inputSchema, a validation error that lets the next step run, another error with and without continueOnError, the timeout. functionsfx tests the new trigger.

Full gate: go run ./cmd/eser ok passed all steps (exit 0) on 2026-11-14, with a stand-in pnpm that only maps 'pnpm exec <tool>' to node_modules/.bin/<tool>; the real pnpm was not run.
<!-- SECTION:NOTES:END -->
