---
id: decision-29
title: Version of the first release after the cutover
date: '2026-10-15 20:38'
status: accepted
---

## Context

Dropping Deno, Bun, the JSR channel, jsx-runtime and laroux-runtime are breaking changes, and every package shares one version. install.sh gates its laroux npm-only message on this version.

## Options

- 5.0.0
- 4.6.0 with Migration notes

## Recommendation

5.0.0 with a complete CHANGELOG Migration section.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-226 (M1-T32), TASK-241 (M2-T9)

Plan key: `release-version`
