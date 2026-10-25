---
id: decision-39
title: Tool for the Go release builds
date: '2026-10-15 20:38'
status: accepted
---

## Context

compile.ts records that GoReleaser was removed only to unify a mixed TS and Go pipeline; that reason goes away.

## Options

- An `eser dev compile` subcommand
- GoReleaser configured with the Rust-triple names

## Recommendation

`eser dev compile`, which keeps the exact names and the cosign flow with no new tool.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-251 (M3-T10)

Plan key: `release-build-tool`
