---
id: decision-7
title: Test runner and assertion library
date: '2026-10-15 20:38'
status: accepted
---

## Context

There are 2,420 Deno.test calls, 134 files on @std/testing/bdd, about 10,110 @std/assert calls and 9 files on @std/testing/mock. node:test exports describe and it under the same names. Switching to node:assert changes semantics (null-prototype equality, the error assertThrows returns). A seam in @eserstack/test-kit turns the assertion move into a change in one place.

## Options

- node:test plus the @eserstack/test-kit seam: it re-exports @std in M0 and M1 and is reimplemented on node:assert and node:test mock in M2
- Codemod straight to node:assert during the cutover
- vitest everywhere

## Recommendation

node:test with the test-kit seam. The cutover codemod never touches assertion semantics, and M2-T4 changes one module instead of 10k call sites. No third-party runner.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-186 (M0-T17), TASK-192 (M0-T18), TASK-198 (M1-T4), TASK-235 (M2-T4)

Plan key: `test-stack`
