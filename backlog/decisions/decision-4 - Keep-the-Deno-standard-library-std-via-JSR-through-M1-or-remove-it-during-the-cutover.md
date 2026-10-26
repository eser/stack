---
id: decision-4
title: >-
  Keep the Deno standard library (@std via JSR) through M1, or remove it during
  the cutover
date: '2026-10-15 20:38'
status: accepted
---

## Context

@std is the Deno standard library served from JSR, so it is a Deno-specific thing in the sense the owner used. Keeping it through M1 keeps about 10k assertion sites and the parse-args, path, fs and parser call sites out of the red window. Removing it in M1 makes the red window larger but leaves no Deno artifact on the merged branch. Nothing is published before M2 removes it.

## Options

- Keep @std behind test-kit and at the existing call sites through M1, and remove all of it in M2 before any publish
- Remove @std during M1 as part of the wave B package tasks
- Keep @std permanently through the npm.jsr.io registry

## Recommendation

Keep it through M1 and remove it in M2 (M2-T2, M2-T3, M2-T4), before the first release. This is a judgement call that trades a shorter red window for a few weeks of @std on main.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-186 (M0-T17), TASK-233 (M2-T2), TASK-234 (M2-T3), TASK-235 (M2-T4)

Plan key: `std-during-cutover`
