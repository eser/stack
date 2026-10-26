---
id: TASK-289
title: 'Write ADRs 0006 to 0008 for laroux R1 and amend decision-46'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - docs
  - adr
  - track-l
milestone: m-7
dependencies:
  - TASK-282
  - TASK-283
  - TASK-284
  - TASK-285
  - TASK-286
  - TASK-287
  - TASK-288
priority: high
ordinal: 289000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the spikes, record the architecture as ADRs in docs/adr (0005 is the Deno exit, TASK-174):
- 0006: the platform. Three packages (decision-46) with the amended subpath list from doc-3 section 2 and react-dom as a peer; the rolldown environment host; fully bundled server graphs; the output contract (dist/client, dist/server/index.js and entry.js); Node and Workers targets (decision-52); no Vite or webpack requirement (decision-48).
- 0007: the RSC runtime and server functions. rsdw and plugin-rsc's transforms as dependencies or the vendoring result from L-S1; ids, keyring and sealing (doc-3 section 6); the guard tables after SA14; the v1 envelope; route binding after SA13; the host port; the skew policy. Mark docs/adr/0003-ssr-react-key-handling-strategy.md Superseded.
- 0008: islands, server islands and prerendering. The single-root gate, code deferral, zero-JS detection, Defer modes and tokens, the props codec, prerender and partial prerender.

Amend decision-46 with the subpath list and the react-dom peer (doc-3 section 2). decision-50 and decision-52 already carry their 2026-10-24 notes. Rules: architecture-guidelines (ADRs), documentation-conventions.

Plan key: L0. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/adr/0006, 0007 and 0008 exist with status Accepted after the owner reads them, each citing the spike results it relies on
- [ ] #2 docs/adr/0003 is marked Superseded by 0007
- [ ] #3 decision-46 has an Amended section with the subpath list and the react-dom peer
<!-- AC:END -->
