---
id: decision-1
title: >-
  How agents commit and coordinate, from M0 on and while the gate is red inside
  M1
date: '2026-10-15 20:38'
status: accepted
---

## Context

The installed git hooks run the full gate on every commit, and inside M1 that gate is red until M1-T37. The workflow rules forbid skipping hooks without approval. About 30 agents work in parallel. M0-T13, T14, T15 and T17 all need package.json and lockfile changes during M0, while the gate is still green.

## Options

- One integration agent owns pnpm-lock.yaml, the root package.json and all dependency edits from M0-T20 to the end of M2. In M1, the cutover branch runs with hooks disabled by the owner (or --no-verify approved for that branch only); each agent uses its own worktree, the hooks are reinstalled in M1-T37, and the owner merges after a green gate
- A temporary `cutover` manifest workflow that checks only staged packages
- One giant cutover commit at the end

## Recommendation

Start the integration agent in M0-T20. In M1, use the cutover branch with owner-disabled hooks and a worktree per agent. Each task proves its own package with `node --test`, tsc and oxlint, and the owner merges only after `pnpm cli ok` passes with deno off PATH.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-185 (M0-T20), TASK-195 (M1-T1), TASK-231 (M1-T37)

Plan key: `red-window-commits`
