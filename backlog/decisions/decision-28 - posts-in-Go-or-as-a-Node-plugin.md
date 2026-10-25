---
id: decision-28
title: posts in Go or as a Node plugin
date: '2026-10-15 20:38'
status: accepted
---

## Context

postsfx exists but is unwired. The TS side has a 1,220-line TUI menu, the OAuth flow and the token store. posts has no standalone npm bin today.

## Options

- Keep posts in Node with its own `eser-posts` bin (M3-T13) that the Go eser forwards to, and port it later
- Port the posts CLI to Go in M3

## Recommendation

Keep posts in Node with an `eser-posts` bin shipped before the Go eser launcher, and revisit after M6 once the Go prompts are proven.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-252 (M3-T13), TASK-254 (M3-T11)

Plan key: `posts-future`
