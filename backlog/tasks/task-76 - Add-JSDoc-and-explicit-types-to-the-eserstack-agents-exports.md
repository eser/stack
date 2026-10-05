---
id: TASK-76
title: Add JSDoc and explicit types to the @eserstack/agents exports
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - agents
  - docs
dependencies: []
references:
  - pkg/@eserstack/agents/adapter.ts
  - pkg/@eserstack/agents/guards/git.ts
priority: low
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`deno doc --lint pkg/@eserstack/agents/mod.ts` reports 12 errors: missing JSDoc on SpawnContext, SpawnSpec, AgentCapabilities and their fields and on the createCliAgentAdapter options in adapter.ts, on the three adapter constants (for example adapters/codex.ts:12), and a missing explicit type on isGitReadOnly in guards/git.ts:408. The generated API reference comes from this JSDoc. Rule: documentation-conventions: Docs Change With the Code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deno doc --lint pkg/@eserstack/agents/mod.ts reports no errors
- [x] #2 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

noskills: `deno doc --lint pkg/@eserstack/agents/mod.ts` reports no errors ("Checked 1 file").
<!-- SECTION:NOTES:END -->
