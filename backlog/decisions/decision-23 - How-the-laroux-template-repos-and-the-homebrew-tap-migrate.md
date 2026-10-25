---
id: decision-23
title: How the laroux template repos and the homebrew-tap migrate
date: '2026-10-15 20:38'
status: accepted
---

## Context

`laroux init` clones gh:eser/laroux-template-{minimal,blog,dashboard,docs} (laroux-server/commands/init.ts:70), and those templates are Deno-era. The eser/homebrew-tap keeps a laroux formula that will never update again, because laroux becomes npm-only. Agents never push to other repositories.

## Options

- Agents prepare patches in scratch clones (M2-T10), and the owner applies them before the first release
- Switch `laroux init` to the in-repo recipes through kit, and archive the template repos
- Leave them as they are

## Recommendation

Patches from M2-T10 that the owner applies, with the laroux formula deprecated through `deprecate!`. Moving templates in-repo can follow later as a separate task.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-240 (M2-T10), TASK-241 (M2-T9)

Plan key: `external-repos`
