---
id: decision-40
title: How the ajan native and WASM libraries are built
date: '2026-10-15 20:38'
status: accepted
---

## Context

ajan/scripts/build.ts, package.ts and generate-packages.ts run under deno run and only wrap go build plus a copy step. cli/commands/ajan.ts:56, the six platform READMEs and .gitignore:69-70 name them.

## Options

- Makefile targets plus a small Go staging helper, done in M0 with every reference updated
- Port the scripts to node

## Recommendation

Makefile targets in M0-T15, so CI build jobs need only Go and clang, and nothing gets ported only to be deleted later.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-188 (M0-T15)

Plan key: `ajan-build-tool`
