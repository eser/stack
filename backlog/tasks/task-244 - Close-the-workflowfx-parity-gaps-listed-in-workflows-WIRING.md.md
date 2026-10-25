---
id: TASK-244
title: Close the workflowfx parity gaps listed in workflows/WIRING.md
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 20:39'
labels:
  - go
  - workflowfx
  - gate
milestone: m-3
dependencies:
  - TASK-243
priority: high
ordinal: 244000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement in pkg/ajan/workflowfx the features the TS engine has and workflowfx lacks: injected validator tools, the manifest step format, fixCommand and --fix, --dry-run, positional args, name and workingDirectory, timeout units, and streaming progress output.

Plan key: M3-T3. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each WIRING.md gap has a Go test
- [x] #2 A precommit --dry-run lists the same steps in the same order under the Go and TS engines, compared against the post-M1 manifest
- [x] #3 `make ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. workflowfx: RunOptions.DryRun (passed as options["dryRun"]; OnMutations is not called); the shell tool now follows the TS shell tool: fixCommand under fix unless dryRun, workingDirectory relative to root, name as the result's display name, numeric stats {exitCode} (the 'output' text stat is gone), and a failure issue with the command's output or 'Command exited with code N', or a note that it stopped at the step's timeout; NewShellTool exports it; ProgressPrinter(w) prints each step as OnStepEnd reports it, in run.ts's format (status column at 50, Passed/Failed/Fixed with seconds, issue lines). Manifest steps and second-based timeouts come from TASK-243's ParseManifest. validatortools.RegisterManifestTools registers the Go validators under the manifest's validate-* names (22 aliases) and whole-repository tools for validate-circular-deps, validate-mod-exports, validate-export-names, validate-package-configs, validate-docs and validate-commit-msg (commitMsgFile, _args[0] or .git/COMMIT_EDITMSG; TASK-247's TS rules), with the TS validators' messages. Found and fixed on the way: validatorTool read exclude and extensions only as []string, so options decoded from a manifest ([]any) were dropped silently and every exclude was ignored; it now reads both. Bridge (EserAjanWorkflowRun): request fields manifest (manifest text, parsed with ParseManifest), dryRun and args; the registry is workflowfx's shell tool plus RegisterManifestTools (the bridge's own shell tool is gone; workflowfx's kills the process group on cancel as processfx.HardenCommand did); results carry workflowId next to id. Tests: pkg/ajan/workflowfx/wiring_gaps_test.go has one test per WIRING.md row (injected tools and the validate-eof alias, both step forms, fixCommand/--fix/--dry-run with mutations not applied, _args, name and workingDirectory, a 0.3 s manifest timeout stopping 'sleep 5', progress order and format, numeric stats and the id) plus TestDryRunListsTheManifestSteps: a stub registry dry run of the repo manifest's precommit workflow reports all 36 steps in manifest order under their display names; engine.test.ts has the same check for the TS engine, so both engines list the same steps in the same order. AC #2 names the post-M1 manifest: both tests read whatever the manifest holds, so they re-check it after M1. bridge_workflow_manifest_test.go runs a manifest dry run through the bridge (fixCommand not run, validate-eof failing on a fixture, workflowId). The bridge still answers after the whole run; streaming across FFI waits for the stream exports of M2-T7 (noted in WIRING.md, which now describes the closed gaps). make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
