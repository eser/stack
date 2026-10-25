---
id: TASK-228
title: 'Skills, part one: tooling, JavaScript and testing rules'
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
priority: medium
ordinal: 228000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In tooling-standards:
- Rename references/deno-and-packages.md to node-and-packages.md.
- Rewrite the toolchain rule: pnpm installs; `pnpm <script>` runs scripts and `pnpm exec` runs pinned tools; oxfmt formats; oxlint lints; tsc type-checks; node:test tests.
- Add the root devDependencies policy and the integration-agent rule.
- Rewrite the config-file table, the registry rule per decision jsr-publishing, and the editor rule.
- Update scripts-and-editor.md, repo-conventions.md, the description and the evals.
In the javascript-practices and architecture-guidelines testing references and docs/agents/architecture-and-code.md:26-29:
- Testing uses node:test with skip, per-file process isolation and @eserstack/test-kit.
- Remove the ban on node:assert and the --trace-leaks rule.
Also:
- Reframe the cross-runtime rule per decision cross-runtime-facade.
- Add an erasable-syntax-only rule that names the tsconfig flag enforcing it.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only); decision-16 (Keep the @eserstack/standards runtime facade); decision-20 (The documented command form for the gate and scripts).

Plan key: M1-T34. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `git grep -ni 'deno\|jsr\|bun' .agents/skills/tooling-standards .agents/skills/javascript-practices .agents/skills/architecture-guidelines` returns nothing
- [ ] #2 validate-skills and the eval trigger files pass
- [ ] #3 Each rewritten rule keeps its Why line and cites ADR 0005 where the reason changed
<!-- AC:END -->
