---
id: decision-20
title: The documented command form for the gate and scripts
date: '2026-10-15 20:38'
status: accepted
---

## Context

devCommand is written into the git hooks, AGENTS.md, the skills and the generated noskills hooks. tooling-standards bans npm run and npx today.

## Options

- `pnpm cli <script>` in M1, then `eser ok` (with a `pnpm ok` alias) once M3-T7 lands
- `node --run cli -- ok`

## Recommendation

`pnpm cli <script>` in M1 and `eser ok` from M3-T7. Allow `pnpm exec` for pinned local tools (oxlint, oxfmt, tsc).

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-199 (M1-T5), TASK-200 (M1-T6), TASK-228 (M1-T34), TASK-229 (M1-T35), TASK-230 (M1-T36), TASK-248 (M3-T7)

Plan key: `command-form`
