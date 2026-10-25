---
id: decision-49
title: srvx in TanStack Start apps
date: '2026-10-23 21:05'
status: accepted
---

## Context

srvx is a regular dependency of @tanstack/start-plugin-core, so every Start app has it in node_modules. Only start-plugin-core's Rsbuild dev middleware imports it (rsbuild/server-middleware.js). laroux's bundles and request path never call it.

## Options

- Accept srvx as an unused transitive dependency
- Reject it, which rules out TanStack Start support

## Decision

Accept it.

## Decided by

The owner decided on 2026-10-23.

## Blocks

Track L tasks (not yet written).

Plan key: `laroux-srvx`

## Superseded

decision-53 (2026-10-23) drops the TanStack Start adapter, so this decision no longer applies.
