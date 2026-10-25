---
id: decision-15
title: Keep Bun support
date: '2026-10-15 20:38'
status: accepted
---

## Context

Bun support today: a cross-runtime adapter and invoker, a bun:ffi backend (1,003 lines), install and update handler entries, bun:ffi in npm-externals.ts, the noskillsserverfx worker search (worker.go:113, :128) and doctor check, a bun row in preflight-npm-consumer.ts and the CI matrix, bun in .mise.toml and flake.nix, and the ajan root-package.json description. The owner named Node as the target.

## Options

- Drop Bun everywhere in M1, with a fallback to node for NOSKILLS_WORKER_RUNTIME=bun
- Keep Bun as a consumer runtime

## Recommendation

Drop Bun in M1 together with Deno, in every place listed. That halves the adapter and FFI surface and the CI matrix, and the M1-T37 audit checks `git grep -wi bun` too.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-195 (M1-T1), TASK-201 (M1-T7), TASK-202 (M1-T8), TASK-203 (M1-T9), TASK-204 (M1-T10), TASK-213 (M1-T19), TASK-224 (M1-T30), TASK-225 (M1-T31)

Plan key: `bun-support`
