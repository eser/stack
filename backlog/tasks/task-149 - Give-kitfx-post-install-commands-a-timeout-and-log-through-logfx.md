---
id: TASK-149
title: Give kitfx post-install commands a timeout and log through logfx
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - kitfx
  - robustness
dependencies: []
references:
  - pkg/ajan/kitfx/applier.go
priority: medium
ordinal: 149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/ajan/kitfx/applier.go:230 runs recipe post-install commands with the caller's context and no ceiling of its own, and the bridge kit exports pass context.Background(), so a hanging command blocks the caller forever. The Verbose path writes failures with fmt.Fprintf(os.Stderr, ...) (line 102) instead of a structured logger. TASK-34 threads context through registry fetching in the same package. Rules: coding-practices: External Calls Have Timeouts; go-practices: Logging Conventions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each post-install command has a per-command timeout
- [x] #2 Failures are returned or logged once through logfx
- [x] #3 A test with a command that never exits shows the bound
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-libs: Checked /Users/eser/projects/eser/stack/pkg/ajan/kitfx/applier.go, deps.go, types.go and workflows.go. runPostInstall wraps each command in context.WithTimeout and calls processfx.HardenCommand, which kills the process group and sets WaitDelay. A negative timeout is rejected before any file is written. Each failure produces exactly one WarnContext on ApplyOptions.Logger, or on a pretty stderr logger when only Verbose is set, and the command is added to PostInstallFailed. If the caller's ctx ends during a command, the phase returns an error and the command is not counted as failed. The bridge module (pkg/@eserstack/ajan) builds, vets and passes its tests against the new signatures. kitfx has no README to update.
<!-- SECTION:NOTES:END -->
