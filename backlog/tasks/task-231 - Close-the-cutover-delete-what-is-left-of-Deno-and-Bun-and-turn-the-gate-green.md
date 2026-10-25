---
id: TASK-231
title: 'Close the cutover: delete what is left of Deno and Bun and turn the gate green'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - cutover
  - deno-removal
  - gate
milestone: m-1
dependencies:
  - TASK-197
  - TASK-200
  - TASK-201
  - TASK-202
  - TASK-203
  - TASK-204
  - TASK-205
  - TASK-206
  - TASK-207
  - TASK-208
  - TASK-209
  - TASK-210
  - TASK-211
  - TASK-212
  - TASK-213
  - TASK-214
  - TASK-215
  - TASK-216
  - TASK-217
  - TASK-218
  - TASK-219
  - TASK-220
  - TASK-221
  - TASK-222
  - TASK-223
  - TASK-224
  - TASK-225
  - TASK-226
  - TASK-227
  - TASK-228
  - TASK-229
  - TASK-230
priority: high
ordinal: 231000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Clean-up steps:
- Delete the root deno.json and etc/codemods. The integration agent removes oxc-parser from the root devDependencies if nothing else uses it.
- Remove the Deno excludes from the validate-runtime-js-apis wiring in .eser/manifest.yml:97-117, and the Deno comments in pnpm-workspace.yaml.
- Audit `git grep -wi deno` and `git grep -wi bun` against the ADR 0005 allowlist, and fix or allowlist each remaining match with a reason.
- Grep for the temporary-aid markers named in the codemod headers.
- Reinstall the git hooks so they run `pnpm cli ok`.
Then, with deno and bun removed from PATH, run `pnpm cli ok`, `pnpm cli preflight` and `make ok`, and hand the branch to the owner for merge.

Decisions this task waits on: decision-1 (How agents commit and coordinate, from M0 on and while the gate is red inside M1); decision-12 (Keep supporting users whose own projects use Deno).

Plan key: M1-T37. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 deno.json, etc/codemods and every Deno-only file are deleted, and no temporary-aid marker remains
- [ ] #2 `git grep -wi deno` and `git grep -wi bun` match only the ADR 0005 allowlist
- [ ] #3 With deno and bun off PATH, `pnpm cli ok`, `pnpm cli preflight` and `make ok` pass, and CI is green on the branch
- [ ] #4 Git hooks run `pnpm cli ok`; the owner has the merge request
<!-- AC:END -->
