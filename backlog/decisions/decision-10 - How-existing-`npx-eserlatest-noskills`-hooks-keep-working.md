---
id: decision-10
title: How existing `npx eser@latest noskills` hooks keep working
date: '2026-10-15 20:38'
status: accepted
---

## Context

Hook configs that v4.5.x wrote into users' repos call `npx eser@latest noskills`. Once the npm eser package becomes a Go launcher (M3-T11), it can only forward to a noskills bin it can find, and npx users have none on PATH.

## Options

- The eser launcher depends on the Node `noskills` package until M4-T6 and passes its bin directory to the Go binary through ESER_PLUGIN_PATH
- The Go eser falls back to `npx --yes noskills@<ver>` on every hook call
- Ship noskills first as an `eser-noskills` bin inside the eser package

## Recommendation

The launcher dependency with ESER_PLUGIN_PATH. It needs no network on the hook path, adds only noskills to the install, and after M4-T6 it is swapped for the noskills Go launcher. The npx fallback stays only as the last resolution step.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-245 (M3-T4), TASK-254 (M3-T11), TASK-261 (M4-T6)

Plan key: `npx-noskills-hooks`
