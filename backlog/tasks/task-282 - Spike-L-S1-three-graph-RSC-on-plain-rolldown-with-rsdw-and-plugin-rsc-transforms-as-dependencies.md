---
id: TASK-282
title: 'Spike L-S1: three-graph RSC on plain rolldown with rsdw and plugin-rsc transforms as dependencies'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - spike
  - track-l
milestone: m-7
dependencies:
  - TASK-189
priority: high
ordinal: 282000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 22, spikes S1, SA3, SA13 and S-I1.
- S1: build rsc scan, rsc, client and ssr with plain rolldown 1.2.14, all server graphs fully bundled, with react-server-dom-webpack 19.3.1 and @vitejs/plugin-rsc's /transforms installed as plain dependencies (decision-48). Lower TS and JSX with rolldown/utils transformSync before the transforms. Fixtures: a .tsx "use client" with type-only and destructured exports, inline "use server" in a .tsx component, and a third-party "use client" package. Check hydration without mismatch, the action round trip and no-JS form, one React per graph, modulepreload links per reference flushed mid-stream, `node dist/server/index.js` from a directory with no node_modules, and build time. Record exactly what the two dependencies install (`pnpm why vite`, `pnpm why webpack`, install size), because decision-48 falls back to vendoring if they break the bundled graphs.
- SA3: the id-keyed serverManifest and the `__laroux_rsc_require__` shim with the webpack globals supplied through the bundler's generic define and inject; `#`, `*`, empty and prototype-key ids fail; a forged `$h` with plaintext bound arguments fails at unseal.
- SA13: compute the route segments that reach each action and Defer target from rolldown's per-entry graphs, including client-imported actions, shared chunks and dynamic imports.
- S-I1: alias references `<ref>~d` plus the hold policy; a held alias blocks only the lazy element; no chunk request before the trigger; SSR emits no modulepreload for aliases; resolveDirective through barrels and package exports.

Run everything in the scratchpad on the pinned Node 26 minor; nothing lands in the repo. Record the results in this task's notes and update doc-3 where they change the design. Gates: TASK-290, TASK-293, TASK-294, TASK-297, TASK-309.

Plan key: L-S1. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 S1's checks are recorded with build times and the dependency install report, and the result says whether plain dependencies work or vendoring is needed
- [ ] #2 SA3 and SA13 results are recorded, including whether route binding is precise enough to ship or falls back to root-bound
- [ ] #3 S-I1's alias and hold behavior is recorded against rsdw 19.3.1 and rolldown 1.2.14
- [ ] #4 doc-3 is updated where a result changes the design, and every gated task names the result it depends on
<!-- AC:END -->
