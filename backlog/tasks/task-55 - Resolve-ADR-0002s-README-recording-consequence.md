---
id: TASK-55
title: Resolve ADR-0002's README recording consequence
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - docs
dependencies: []
references:
  - docs/adr/0002-magical-moment-and-tthw-target.md
priority: low
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/adr/0002-magical-moment-and-tthw-target.md lists a 60-second asciinema recording at the top of the README as a consequence; none exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Either the recording is added or the ADR records that the consequence was dropped and why
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

docs-tooling: ADR-0002 keeps its original text; the Status line says it was amended and an Amendments section lists the reasons. The facts it cites hold: four TestCrash_* functions in pkg/ajan/noskillsserverfx/sessions_crash_test.go, a 'Why this exists' section in cmd/noskills-server/README.md, and a README that only ever had a placeholder comment for the recording. The owner should confirm the reasons. The README placeholder and its untagged TODO are outside this unit's paths (crossUnitNeeds).

Orchestrator: removed the asciinema placeholder and its TODO from cmd/noskills-server/README.md.
<!-- SECTION:NOTES:END -->
