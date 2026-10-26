---
id: TASK-285
title: 'Spike L-S4: Workers target, fetch-mode islands and the Node host'
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
ordinal: 285000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 22, spikes S12, S-I8, SA5, S-I6 and S9, plus the KV session driver.
- S12 and S-I8: build the L-S1 app's fetch entry for workerd with nodejs_compat and the rsdw edge builds, serve dist/client through Workers static assets, run it in `wrangler dev`, deploy nothing. Check POST routing past static assets for `_.rsc`, `_.query`, `_.island` and `/_laroux/`, the content type of prerendered `_.rsc` assets, the `_headers` path for CSP hashes, build-time Node prerender for a workerd target, and Cache API behavior (custom domain only, so mock it in CI and record the documented limits).
- SA5: AsyncLocalStorage on workerd across Suspense flushes and streaming action results, and the single-instance check with a doubled install.
- S-I6: fetch-mode islands on Node and workerd: signed and sealed tokens, segment-bound URLs shared across pages, preload reuse by createFromFetch, the 2048-character POST fallback, public-scope throws, Cache-Tag through a CDN-like proxy on Node, the 409 path with the reload guard, and proxy.ts on `<segment>/_.island`.
- S9: autocannon against runtime.http with per-chunk-flush compression and file-handle static serving, compared with srvx 1.0.5: first-shell-byte time, throughput, memory at 500 concurrent streams.
- Sessions: a KV-backed driver in `wrangler dev` with a local KV namespace, and the sealed-cookie driver on both targets.
- The ajan reactor on workerd (decision-45, amended 2026-10-24): import the wasi-profile reactor into the Worker bundle as a Wasm module and run it on the plain WASI shim; confirm that Workers refuse to compile Wasm from bytes at runtime; record the first-call time in a fresh isolate, memory after 10k calls and the bundle's compressed size; check whether nodejs_compat's virtual filesystem can back a preopen for the fs names.

Run everything in the scratchpad on the pinned Node 26 minor; nothing lands in the repo. Record the results in this task's notes and update doc-3 where they change the design. Gates: TASK-298, TASK-302, TASK-308, TASK-312, TASK-318.

Plan key: L-S4. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 S12 and S-I8 results are recorded, including whether Worker-first routing is needed for the framework paths
- [ ] #2 SA5 says whether request APIs work through AsyncLocalStorage on workerd or need an explicit context
- [ ] #3 S-I6 results are recorded on both targets, and the token format and URL layout are confirmed or changed
- [ ] #4 S9 records the measurements and whether laroux-server keeps the in-repo adapter
- [ ] #5 The KV and cookie session drivers are shown working in `wrangler dev`
- [ ] #6 The reactor runs in `wrangler dev`, and its load time, memory and bundle size are recorded
- [ ] #7 doc-3 is updated where a result changes the design, and every gated task names the result it depends on
<!-- AC:END -->
