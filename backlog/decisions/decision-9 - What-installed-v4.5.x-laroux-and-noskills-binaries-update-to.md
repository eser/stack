---
id: decision-9
title: What installed v4.5.x laroux and noskills binaries update to
date: '2026-10-15 20:38'
status: accepted
---

## Context

Installed binaries run the old update.ts, not the new code. When a release has no laroux or noskills archive, they hit the old checksum and download failure (update.ts:124-155). laroux self-update would then break permanently, and noskills self-update would break until M4-T6.

## Options

- Ship small Go forwarding stubs under the old archive names in every release. They run `npx laroux@<ver>` or `npx noskills@<ver>`, or print the npm command (M3-T14)
- Rely on the 4.5.3 bridge release updater only (M0-T21); binaries older than 4.5.3 still fail
- Accept the broken self-update and document it in Migration

## Recommendation

Forwarding stubs, plus the 4.5.3 updater if that decision is taken. The stubs are a few lines of Go, keep the archive names, and turn a failed update into a working command. They are retired by owner decision, recorded in ADR 0005.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-253 (M3-T14), TASK-254 (M3-T11), TASK-261 (M4-T6)

Plan key: `legacy-binary-updates`
