---
id: decision-44
title: The permissions rule in workflow-practices
date: '2026-10-15 20:38'
status: accepted
---

## Context

roles-and-boundaries.md:88-97 is built on Deno's --allow flags. Node's permission model is opt-in and coarser.

## Options

- Drop the rule
- Map it to node --permission

## Recommendation

Drop the rule. The security skill keeps least-privilege guidance for subprocesses and secrets.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-229 (M1-T35)

Plan key: `deno-permission-rule`
