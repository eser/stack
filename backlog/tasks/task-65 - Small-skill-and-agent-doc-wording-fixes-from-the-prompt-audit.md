---
id: TASK-65
title: Small skill and agent-doc wording fixes from the prompt audit
status: Done
assignee: []
created_date: '2026-09-26 09:57'
updated_date: '2026-10-04 20:52'
labels:
  - docs
  - skills
dependencies: []
references:
  - .agents/skills/
  - docs/agents/
priority: low
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remaining medium items in skill files: coding-practices readability.md:45 says TODO(owner) while workflow-practices requires TODO(TASK-n); task-workflow.md:23-31 still scripts 'write a todo list' steps; http-and-auth.md:167 'currently ... until they are added' (resolve with TASK-24); docs/agents/architecture-and-code.md 'the next one is 0005'; docs/agents/languages-and-security.md baseline counts in past tense; docs/agents/release-and-ci.md version-pinned incident story.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each line is rewritten as the audit report proposes
- [x] #2 validate-skills.ts passes with 0 errors and 0 warnings
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

docs-tooling: Every item in the unit's paths is rewritten:
- readability.md: TODO(TASK-12).
- task-workflow.md: the todo-list steps are gone.
- architecture-and-code.md: numbering rule instead of '0005'.
- languages-and-security.md: present-tense baseline statement with no counts.
- release-and-ci.md: no version-pinned story and a your_release_tag placeholder.
The http-and-auth.md item belongs to another unit. The audit report was not available, so each rewrite follows the task description.
<!-- SECTION:NOTES:END -->
