---
id: TASK-325
title: Let the CLI resolve every placeholder the noskills completeness gate checks
status: Done
assignee: []
created_date: '2026-10-25 01:09'
updated_date: '2026-10-25 02:59'
labels:
  - noskills
  - feature
dependencies: []
priority: medium
ordinal: 328000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-258 and TASK-324. approveDiscoveryReview (state/machine.ts:323) refuses to leave DISCOVERY_REFINEMENT while any living-spec placeholder is unresolved (spec/living.ts:523 checkSpecCompleteness). Only discovery answers fill placeholders (commands/next.ts:544 markPlaceholderFilled via questionIdToSectionId), and sections such as Summary, Premises, Tasks and Acceptance Criteria map to no discovery question. livingSpec.applyNaToFile (marking a section N/A with a reason) exists, but no command calls it. So a spec cannot pass the gate through the CLI alone; the golden scenarios edit the spec state to get past it. Design: a command to fill a section and one to mark it N/A with a reason (for example 'noskills spec <name> section <id> fill|na "<reason>"'), or have ac/task/note fill their sections; then port the same to cmd/noskills (Go copies the TS gate).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every placeholder the gate checks can be filled or marked N/A through a CLI command, in TS and Go
- [x] #2 A golden scenario passes the gate without editing state files
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25: rtk make ok and deno task cli ok passed. (Done by a delegated agent.)
New 'spec <name> section [list]' and 'section <id> fill "text" | na "reason"', in TS and Go, printing the same bytes.
- fill and na work in DISCOVERY and DISCOVERY_REFINEMENT only.
- They refuse an empty text, an unknown, hidden or already resolved section, and an N/A reason under 20 characters.
- They update spec.md (applyAnswerToFile or applyNaToFile) and the spec's state, plus state.json when it names the spec.
The gate refusal and the compiler's gate action now name the sections and the commands. 'section' is a reserved spec name and is in spec --help.
ac, task and note still do not fill Acceptance Criteria or Tasks: they keep separate records and work in every phase.
Tests: commands/spec-section.test.ts plus new machine.test.ts and compiler.test.ts cases, all seen failing first; Go spec_sections_test.go in noskillsfx and cmd/noskills.
AC #2: the new golden spec_sections (34 steps) reaches SPEC_PROPOSAL with CLI commands only, no state-file edits.
Re-recorded for the hint text: next_validation, lifecycle, lifecycle_concerns, spec_execution, spec_split_answer and spec_new. All replay against Go.
Limits: a resolved section cannot be re-filled, and the lifecycle scenarios still use their state-file edit.
<!-- SECTION:NOTES:END -->
