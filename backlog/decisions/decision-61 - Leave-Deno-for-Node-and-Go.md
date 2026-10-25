---
id: decision-61
title: Leave Deno for Node and Go
date: '2026-10-24 03:00'
status: accepted
---

## Context

Deno's development ends about a year after 2026-10-09, and Deno Deploy shuts down in six months. decision-1 to decision-60 settle how the repository moves off Deno.

## Decision

Move to Node 26 with pnpm, oxlint, oxfmt, tsc 7 and node:test in one cutover, drop Bun, and let Go own the binaries, the working parts and the business logic, with the TypeScript libraries delegating through the ajan bridge. The full record, with the owner's answer to every decision and the allowlist, root devDependencies and integration-agent appendices, is docs/adr/0005-leave-deno-for-node-and-go.md.

## Decided by

The owner accepted the decisions on 2026-10-15, 2026-10-23 and 2026-10-24.

## Blocks

TASK-174 (M0-T1)

Plan key: `leave-deno`
