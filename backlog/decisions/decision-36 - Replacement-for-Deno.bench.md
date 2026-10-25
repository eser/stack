---
id: decision-36
title: Replacement for Deno.bench
date: '2026-10-15 20:38'
status: accepted
---

## Context

There are 154 benches in 15 files, all with a uniform shape, and no gate step runs them.

## Options

- mitata through a codemod
- tinybench
- Go benchmarks
- Delete them

## Recommendation

mitata through the bench codemod. Delete cli/startup.bench.ts, which measures Deno module loading.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-193 (M0-T19), TASK-220 (M1-T26)

Plan key: `benches`
