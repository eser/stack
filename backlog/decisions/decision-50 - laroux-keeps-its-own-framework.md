---
id: decision-50
title: laroux keeps its own framework
date: '2026-10-23 21:05'
status: accepted
---

## Context

laroux will host TanStack Start. It also has its own file-route framework, and one team maintaining two frameworks costs two routing models, two server-function models, two sets of docs and templates.

## Options

- Keep laroux's own framework as a server-first RSC framework next to Start: React "use server" actions, file routes (page, layout, route, proxy), zero configuration and eserstack integrations
- Shrink it to a thin preset over TanStack Router
- Retire it once Start runs on laroux

## Decision

Keep it as a first-class framework next to Start. Start apps keep createServerFn. The two adapters share the bundler, the RSC runtime, the dev server, HMR and the fetch host, so they differ only in routing and server functions.

## Decided by

The owner decided on 2026-10-23.

## Blocks

Track L tasks TASK-280 to TASK-317 (doc-3).

Plan key: `laroux-native-kept`

## Amended

decision-53 (2026-10-23) drops the TanStack Start adapter, so the sentences about Start and its shared adapters no longer apply. laroux keeps its own framework, designed in doc-3.
