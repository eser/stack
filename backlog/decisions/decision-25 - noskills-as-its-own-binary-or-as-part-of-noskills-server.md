---
id: decision-25
title: noskills as its own binary or as part of noskills-server
date: '2026-10-15 20:38'
status: accepted
---

## Context

noskills-server already links noskillsfx. Hooks need fast startup, and the daemon has a different lifecycle.

## Options

- A separate cmd/noskills sharing noskillsfx
- Subcommands of cmd/noskills-server

## Recommendation

A separate cmd/noskills with its own archive.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-257 (M4-T2), TASK-261 (M4-T6)

Plan key: `noskills-binary-layout`
