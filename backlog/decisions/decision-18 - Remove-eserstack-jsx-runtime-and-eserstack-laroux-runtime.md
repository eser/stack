---
id: decision-18
title: Remove @eserstack/jsx-runtime and @eserstack/laroux-runtime
date: '2026-10-15 20:38'
status: accepted
---

## Context

jsx-runtime exists for Deno's precompile JSX transform, which tsc, oxc and rolldown do not support. Both packages are used only by their own recipes and by commented-out lines in the barrel that M0-T9 deletes.

## Options

- Delete both packages and their recipes in M1
- Keep them and port their tests

## Recommendation

Delete both in M1 and list them in CHANGELOG Migration. Their published versions stay available.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-210 (M1-T16), TASK-227 (M1-T33)

Plan key: `legacy-packages`
