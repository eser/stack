---
id: decision-41
title: pnpm version pin
date: '2026-10-15 20:38'
status: accepted
---

## Context

pnpm 11.18.0 is installed locally and CI pins 10. corepack and pnpm/action-setup need an exact version in packageManager. pnpm 12 (a Rust rewrite) is stable, but npm's latest tag still points at 11.

## Options

- Pin exactly pnpm@11.18.0 now, and upgrade to 12 later
- Go straight to 12

## Recommendation

packageManager `pnpm@11.18.0`; upgrading to 12 is a separate task after M2.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-189 (M0-T13)

Plan key: `pnpm-version`
