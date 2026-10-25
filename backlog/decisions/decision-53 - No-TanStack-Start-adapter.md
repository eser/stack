---
id: decision-53
title: No TanStack Start adapter
date: '2026-10-23 23:10'
status: accepted
---

## Context

doc-2 planned laroux as a third host for TanStack Start next to Vite and Rsbuild, through `adapters/start` in laroux-server. That adapter imports start-plugin-core's dist modules by file path, which breaks on Start's upgrades, and it brings Babel, Lightning CSS and srvx into every Start app. The laroux-actions-islands design (etc/temp/plan/laroux-actions-islands.json) gives laroux-native its own React server functions on Flight, so laroux-native does not need start-plugin-core.

## Options

- Keep the Start adapter in the first release
- Ship it later
- Drop it

## Decision

Drop it. laroux ships only its own framework. `adapters/start` leaves decision-46, start-plugin-core and the other TanStack packages leave the plan, and the Start-only spikes (S2, S3, S4, S5, S8, S10, S11) are removed. decision-49 (srvx) no longer applies.

## Decided by

The owner decided on 2026-10-23.

## Blocks

Track L tasks TASK-280 to TASK-317 (doc-3).

Plan key: `laroux-no-start-adapter`
