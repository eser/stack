---
id: decision-51
title: HMR and Fast Refresh in the first release
date: '2026-10-23 21:05'
status: accepted
---

## Context

doc-2 split `laroux dev` in two phases because rolldown's dev APIs (DevEngine, DevRuntime, hotUpdate, moduleRunnerTransform) are experimental and changed in 1.2.8, 1.2.12 and 1.2.13. Phase 1 rebuilt and fully reloaded the page; phase 2 added HMR and Fast Refresh.

## Options

- Phase 1 first: rebuild, worker swap and full reload, with HMR later
- HMR and Fast Refresh from the first release

## Decision

From the first release. What doc-2 lists as phase 2 ships in the first track L release:
- client HMR on rolldown's DevEngine with a DevRuntime that implements import.meta.hot (accept, dispose, data, invalidate, prune, on, send), which TanStack Router's route HMR code also needs
- React Fast Refresh through transform.jsx.refresh, and inside the RSC pre-transform for directive files
- server component edits that refetch `<path>/_.rsc` and keep client state
- Start dev with TSS_DEV_SERVER true

S6 and S7 run right after S1. rolldown is pinned to an exact version, and every bump runs the HMR tests. If S7 shows that DevEngine cannot carry this, the fallback is laroux's own HMR runtime over rolldown watch, and the owner reviews that cost before it starts.

## Decided by

The owner decided on 2026-10-23.

## Blocks

Track L tasks TASK-280 to TASK-317 (doc-3).

Plan key: `laroux-hmr-day-one`
