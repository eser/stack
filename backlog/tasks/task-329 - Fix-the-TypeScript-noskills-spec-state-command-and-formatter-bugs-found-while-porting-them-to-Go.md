---
id: TASK-329
title: >-
  Fix the TypeScript noskills spec state command and formatter bugs found while
  porting them to Go
status: Done
assignee: []
created_date: '2026-10-25 02:13'
updated_date: '2026-10-25 02:37'
labels:
  - noskills
  - bug
  - security
dependencies: []
priority: high
ordinal: 332000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-258.1; Go already behaves. Security: (1) commands/next-validation.ts:188 reads specState.path without a path check, so a crafted state can send a file outside the project to the model. Formatter: (2) output/formatter.ts:195/335 print '[object Object]' for statusReport criteria in markdown and text, and so do debt items (:210/:347). (3) formatter.ts:272/376 read the ledger summary as a completion summary for 'ledger -o markdown/text' ('Spec: undefined ...'); records never show, measurement-draft markdown is empty, and a null summary throws. Commands: (4) commands/spec.ts:972 revisit writes only the spec file, so state.json stays BLOCKED/EXECUTING. (5) context/compiler.ts:2392/2509 say 'revisited from EXECUTING' after a revisit from BLOCKED. (6) commands/reset.ts:67 reset in DISCOVERY..SPEC_APPROVED crashes through machine.ts resetToIdle. (7) spec.ts:1026/1053/1116/1147/1212/1231 ac/task/note on a missing spec crash uncaught. (8) spec.ts:740/902 usage examples 'spec split --spec=parent' and 'spec revisit --spec=my-spec' do not parse. (9) commands/review.ts:120 parseInt accepts '--question=1x'. (10) state/persistence.ts:743-750 migration crashes with ENOTEMPTY when .eser/.events and .eser/.state/events both exist. (11) context/transition-validation.ts:175 prints 'a object'; :232 throws on an answered follow-up without an answer. (12) free.ts:28 and validate.ts:45/61/120 never load the command prefix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The security item has a failing test and is fixed first
- [x] #2 Every other item is fixed in TS with a test, or documented as intended
- [x] #3 The affected goldens are re-recorded and pass against Go
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25: rtk make ok and deno task cli ok passed. Fixed in TS and Go, each with a test that failed first:
(1) Security: commands/next-validation.ts readSpecDocument refuses a specState.path that leaves the project, by its segments and by its real path, so a symlink is caught too; Go already read through os.Root. Test: next-validation.test.ts 'never sends a spec path outside the project'.
(2) formatter.ts itemLabel prints criteria and debt items as 'id: text' (Go output_format.go itemLabel).
(3) The ledger has its own documents: commands/ledger.ts formatLedger and formatMeasurementDraft (records, summary, 'No summary yet.'). Go: noskillsfx/ledger_format.go.
(4) revisit writes state.json too when it names the spec.
(5) Both revisit instructions name revisitHistory's from.
(6) reset refuses a planning phase with machine.resetRefusal before the directory check, exit 1.
(7) The spec dispatcher catches SpecNotFoundError for every 'spec <name> ...' subcommand (also plain 'spec ghost', which crashed in status); Go turns it into the same refusal.
(8) The split and revisit examples now read 'spec <name> split|revisit'. They cannot be reached from the CLI, which always passes --spec, so this is a text fix without a test.
(9) review --question= takes digits only (review.questionIndexOf; Go questionNumber, which replaces the unused jsParseInt).
(10) The legacy migration refuses before moving anything when a new sessions or events folder already holds files, and replaces an empty one (TS and Go, with tests).
(11) describeValue says 'an object'; an answered follow-up without an answer is left out.
(12) free and validate load the command prefix.
TS and Go print the same output for reset and the missing-spec cases (checked side by side).
Goldens re-recorded from TS, except the three TASK-328 owned. Changed: spec_states (the reset and missing-spec refusals; review --question=1x no longer answers, so later steps still hold a pending delegation; the ledger documents), spec_execution (criteria labels) and lifecycle_concerns. lifecycle_concerns was stale since TASK-324's init fix: --non-interactive now prints nothing to stdout, as init_bare already recorded. All 22 replay against Go.
<!-- SECTION:NOTES:END -->
