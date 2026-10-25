---
id: TASK-228
title: 'Skills, part one: tooling, JavaScript and testing rules'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 12:00'
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
- [x] #1 `git grep -ni 'deno\|jsr\|bun' .agents/skills/tooling-standards .agents/skills/javascript-practices .agents/skills/architecture-guidelines` returns nothing
- [x] #2 validate-skills and the eval trigger files pass
- [x] #3 Each rewritten rule keeps its Why line and cites ADR 0005 where the reason changed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- tooling-standards: references/deno-and-packages.md is now node-and-packages.md (links updated in SKILL.md and scripts-and-editor.md). Tooling Preference names pnpm, `pnpm <script>`, `node --run`, `pnpm exec`, oxfmt, oxlint, `tsc --noEmit` and `node --test` (decision-20, decision-33). Configuration Files makes package.json the only manifest and lists tsconfig.json, .oxlintrc.json and .oxfmtrc.json. New rules Root devDependencies (ADR 0005 Appendix C) and Lockfile and Root Manifest Owner (Appendix D). Registry Preference is npm only (decision-5). Editor Configuration names oxfmt and the oxc extension. repo-conventions.md, the description, the Always list and evals/triggers.json are updated.
- javascript-practices: Cross-Runtime APIs reframed per decision-16 (Node-only facade, runtime.exec and runtime.process.isStandalone, add missing APIs to the facade). New sections Erasable Syntax Only (erasableSyntaxOnly) and Explicit Export Types (isolatedDeclarations); Import Paths covers verbatimModuleSyntax and `with { type: "json" }`. testing.md: node:test, test-kit, the skip option, no .tsx tests, checkLeaks, no --test-force-exit, mitata benches.
- architecture-guidelines: testing.md uses node:test and test-kit, describes per-file process isolation, drops the node:assert ban and the --trace-leaks rule; the runtime adapter rule in hexagonal-architecture.md and SKILL.md is reframed. docs/agents/architecture-and-code.md Tests section rewritten.
- AC #1: `git grep -niw` on the three skills returns nothing; the literal (non-word) pattern matches only "bundle"/"bundler" substrings (laroux-bundler, the hexagonal bundler example). AC #2: validate-skills reports 0 errors and 0 warnings; the trigger files parse and were checked by hand against the new descriptions (the tree has no trigger runner). No behavior evals were run.
<!-- SECTION:NOTES:END -->
