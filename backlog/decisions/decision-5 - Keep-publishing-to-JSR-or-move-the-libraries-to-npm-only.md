---
id: decision-5
title: Keep publishing to JSR or move the libraries to npm only
date: '2026-10-15 20:38'
status: accepted
---

## Context

JSR keeps operating on Cloudflare infrastructure, but the jsr npm CLI downloads and runs a Deno binary to publish (to confirm in M0-T2), so keeping JSR keeps Deno in CI. Node refuses to strip types under node_modules, so npm libraries need an emitted JS plus .d.ts build. About 38 READMEs use `pnpm add jsr:@eserstack/<x>`.

## Options

- Freeze JSR at the last 4.5.x (not yanked) and publish all libraries to npm only
- Keep JSR through `jsr publish` with a generated jsr.json alongside npm
- Dual-publish for one deprecation window

## Recommendation

Freeze JSR at 4.5.x and publish to npm only. This is the only option that removes Deno completely: it deletes gen-jsr-manifests, deno.extra.json, the JSR publish job and the hidden Deno dependency.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-194 (M0-T21), TASK-200 (M1-T6), TASK-203 (M1-T9), TASK-204 (M1-T10), TASK-224 (M1-T30), TASK-226 (M1-T32), TASK-228 (M1-T34), TASK-232 (M2-T1), TASK-236 (M2-T5)

Plan key: `jsr-publishing`
