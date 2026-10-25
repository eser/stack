---
id: decision-12
title: Keep supporting users whose own projects use Deno
date: '2026-10-15 20:38'
status: accepted
---

## Context

Some features support users' Deno projects and do not depend on Deno as this repo's runtime: noskills detect/codebase.ts:47, :127-128, the `deno run` and `deno x` network-command recognition in sync/hook-commands.ts:134-180, the default concern texts, kitfx ProjectTypeDeno with `deno add` hints (deps.go:20-21, :82, :89; types.go:93), and the codebase tools reading deno.json in user repos. A blanket grep would delete them.

## Options

- Keep them as product features, list their paths in the ADR 0005 allowlist, and let the validator ban only Deno identifiers in code
- Delete them in M1 with everything else

## Recommendation

Keep them and allowlist them. Supporting users' Deno projects costs strings, not runtime code, and noskills and kit lose real cases if they are dropped. Revisit when Deno support ends in about October 2027.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-204 (M1-T10), TASK-211 (M1-T17), TASK-216 (M1-T22), TASK-231 (M1-T37), TASK-257 (M4-T2)

Plan key: `user-deno-projects`
