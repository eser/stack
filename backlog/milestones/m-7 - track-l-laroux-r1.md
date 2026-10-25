---
id: m-7
title: "Track L laroux R1 on rolldown and Flight"
---

## Description

Build laroux R1 as doc-3 describes, in parallel with M3 to M6 after M2: React server functions on Flight, islands and server islands, prerendering and partial prerendering, sessions, i18n routing, the typed env split, onRequestError and composable fetch handlers, with HMR and Fast Refresh, on Node and Cloudflare Workers, in three packages (decision-46). The old pipeline stays deprecated beside it for one 5.x minor and is deleted in 6.0.0, the major right after R1 (decision-58).

Exit criteria:
- Every spike in doc-3 section 22 has a recorded result, and ADRs 0006 to 0008 are accepted
- The conformance harness passes on Node (`node dist/server/index.js` with no node_modules) and in `wrangler dev`, including the security regression suite and the real-browser tests
- `laroux dev` keeps client state across a client component edit and a server component edit, on a fixture with islands and actions
- The laroux-app and laroux-workers-app recipes build and serve with the packed packages
- The boundary validators pass, and no laroux server graph for workerd reaches node:ffi or an ajan binding outside the wasi profile; profile names work on workerd through the reactor (TASK-318)
- doc-3 section 23's parity rows match what the conformance fixtures show
