---
id: TASK-229
title: 'Skills, part two: release, coding, workflow, security, docs and frontend rules'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - cutover
  - docs
  - skills
milestone: m-1
dependencies:
  - TASK-200
  - TASK-226
priority: medium
ordinal: 229000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite the remaining Deno rules:
- release-and-ci: SKILL.md description and release-process.md (:27, :56, :108-112, :137, :239, :243, :267), per decisions jsr-publishing and binaries, plus its evals. Add the rule that channels decide from the release, not the merge.
- coding-practices: readability.md (formatter owner, lint rule names, oxlint pragma syntax in examples, TODO tags and camelcase now enforced by the Go validator, and the TODO(owner) example fixed to the decided tag form) and resources-and-io.md (benches with mitata).
- workflow-practices: roles-and-boundaries.md loses the Deno permissions rule (decision deno-permission-rule) and the generated deno.json lines.
- security-rules.md: use Symbol.for("nodejs.util.inspect.custom") and remove DENO_ENV.
- documentation-conventions: replace the `deno run jsr:` justification for CLI-first packages (link backlog task-101) and the deno doc lint rule.
- frontend-practices: laroux.md:70 and bundling-and-loading.md:23.
- enrichment and eser-rules-manager: evals and skill-discovery.md:42.
- pkg/@eserstack/directives/03-contributing.md:49-52.

Decisions this task waits on: decision-20 (The documented command form for the gate and scripts); decision-21 (Required TODO tag form and what the validator reads); decision-44 (The permissions rule in workflow-practices).

Plan key: M1-T35. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `git grep -ni 'deno\|bun' .agents pkg/@eserstack/directives` returns nothing
- [ ] #2 validate-skills and every evals/triggers.json pass
<!-- AC:END -->
