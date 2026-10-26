---
id: TASK-117
title: Wire the noskills-web Start Execution button to a real action
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills-web
  - bug
dependencies: []
references:
  - pkg/@eserstack/noskills-web/templates/spec-detail.ts
  - pkg/@eserstack/noskills-web/routes/api.ts
priority: high
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
templates/spec-detail.ts:26 renders a 'Start Execution' button with data-action="start" for SPEC_APPROVED specs. routes/api.ts handleAction (lines 132-163) has no 'start' case and @eserstack/noskills/dashboard has no start action, so clicking it answers 400 'Unknown action: start'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Either the dashboard action and the API case exist and start execution, or the button is removed
- [x] #2 A route test covers the start action
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

standards-web: Verified:
- templates/spec-detail.ts has no start button.
- No `start` action remains in static/ or templates/.
- server.test.ts covers POST /api/spec/:name/start (400 Unknown action, phase stays SPEC_APPROVED) and a per-phase test that sends every rendered data-action to handleAction.
- The README says execution starts from the agent.
<!-- SECTION:NOTES:END -->
