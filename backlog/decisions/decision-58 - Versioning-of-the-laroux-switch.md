---
id: decision-58
title: Versioning of the laroux switch
date: '2026-10-24 02:30'
status: accepted
---

## Context

All 47 TypeScript packages share one version, and decision-29 fixes only the first release after the cutover (5.0.0). Track L lands after 5.0.0. Deleting the old laroux pipeline is a breaking change, so it forces a major on every package.

## Options

- Additive in 5.x: R1 ships beside the old pipeline, which is deprecated, and the next repo-wide major deletes it
- Delete the old pipeline in track L and release 6.0.0 for every package

## Decision

Additive, with a short window. R1 ships in a 5.x minor with the old pipeline deprecated, and the old pipeline is deleted in 6.0.0, the major right after it: the deprecation lasts one 5.x minor, and no other work waits to join that major. TASK-317 is ready when the R1 minor is released and lands on main right after that release, so the next release is 6.0.0. The owner decides when each release happens.

## Decided by

The owner chose the additive path on 2026-10-24 and asked that the deletion follow R1 without a long deprecation window (doc-3 section 25, question 3).

## Blocks

TASK-307 (L4o), TASK-313 (L5f), TASK-317 (L9)

Plan key: `laroux-versioning`
