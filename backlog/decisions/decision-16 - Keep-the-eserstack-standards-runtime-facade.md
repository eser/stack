---
id: decision-16
title: Keep the @eserstack/standards runtime facade
date: '2026-10-15 20:38'
status: accepted
---

## Context

318 files call runtime.* (path.join 420 times, fs.readTextFile 361 times, and so on). The Node adapter already implements every method, and validate-runtime-js-apis enforces the facade through its process rule.

## Options

- Keep the facade Node-only (plus the browser entry for laroux) through the cutover and decide on collapse in M6
- Collapse it to node:* plus Web APIs during M1

## Recommendation

Keep the facade Node-only, with no top-level await and the process rule intact, so no call site changes in M1. Decide on collapse in M6-T4.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-201 (M1-T7), TASK-204 (M1-T10), TASK-228 (M1-T34), TASK-270 (M6-T4)

Plan key: `cross-runtime-facade`
