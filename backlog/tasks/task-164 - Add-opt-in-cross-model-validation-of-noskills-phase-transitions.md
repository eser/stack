---
id: TASK-164
title: Add opt-in cross-model validation of noskills phase transitions
status: Done
assignee: []
created_date: '2026-10-05 00:58'
updated_date: '2026-10-15 19:34'
labels:
  - noskills
  - feature
dependencies: []
priority: medium
ordinal: 164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the removed noskills TODOS.md ("Agent B cross-model validation via Agent Bridge"). README-HOW described an Agent B that checks each phase transition in an isolated context (`noskills next --validate` or a manifest default), but no code implements it: there is no --validate flag and no second agent, so the doc now says so. `noskills run` already resolves agents through @eserstack/ai (`adapters.factoryFor` in commands/run.ts). A validator can run as a second model given only the spec, the discovery answers and the proposed transition, and report findings before the human approves. Too large for the TODOS cleanup: it needs a new CLI flag and manifest key, a judge prompt, a provider and model choice, a timeout and failure policy, tests with a fake provider, and the same transition output in the Go mirror (pkg/ajan/noskillsfx). The owner should first decide which transitions get validated (end of discovery, spec proposal, task completion), which model runs the check, and whether a failed check blocks or only reports.

Decision: validate at the end of discovery and at the spec proposal, before the human approves. The model comes from a `validate` entry in the manifest's noskills section (agent and model), resolved like `noskills run` resolves agents. The validator only reports findings and never blocks; it has a 120 second timeout, and a failure or timeout is reported as a skipped validation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `noskills next --validate`, and a `validate` key in the manifest's noskills section, run a second agent through @eserstack/ai that sees only the spec, the discovery answers and the proposed transition, and its findings appear in the output before the human approves
- [x] #2 The validator call has a timeout; when no agent can be resolved or the call fails or times out, the output says validation was skipped and the transition goes to human review
- [x] #3 Tests with a fake ai provider cover findings, a skipped validation and a timeout
- [x] #4 README-HOW's Phase Transition Protocol describes the validator and how to turn it on
- [x] #5 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Verified:
- The `--validate` flag (VALIDATE_FLAG in next.ts) and the manifest `noskills.validate` entry go through withValidation, then validationFor, then runValidator.
- The defaults are claude-code with claude-sonnet-5, the same values run.ts already used (now `schema.DEFAULT_AGENT_*`).
- The timeout is 120 s, every failure becomes a skipped validation, and the README-HOW subsection "The transition validator" matches the code.
- The Go-served `next` (bridge and noskillsserverfx) does not run the validator yet; this is listed in crossUnitNeeds.

I added a reason to the two `require-yield` ignores in the validator tests and to the `//nolint` comments in validation_test.go that had none.
<!-- SECTION:NOTES:END -->
