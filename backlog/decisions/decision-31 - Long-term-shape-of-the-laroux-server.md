---
id: decision-31
title: Long-term shape of the laroux server
date: '2026-10-15 20:38'
status: accepted
---

## Context

laroux stays on Node with runtime.http. A Go httpfx shell in front of a Node render worker could own static files, HMR and restarts, and would fix ESM cache growth in dev, but it adds IPC.

## Options

- Node only
- A Go shell plus a Node render worker, decided by an ADR after M6

## Recommendation

Node only for now. Revisit with an ADR after M6 if dev-server memory or lifecycle problems appear.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

none

Plan key: `laroux-server-future`
