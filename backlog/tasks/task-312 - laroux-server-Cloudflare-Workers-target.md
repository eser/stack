---
id: TASK-312
title: 'laroux-server: Cloudflare Workers target'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux-server
  - track-l
milestone: m-7
dependencies:
  - TASK-285
  - TASK-287
  - TASK-302
  - TASK-309
  - TASK-318
priority: medium
ordinal: 312000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 19 and decision-52. `laroux build --target workerd`: the Worker bundle with nodejs_compat and the rsdw edge builds, wrangler config, dist/client for static assets, `_headers` with prerendered CSP hashes, Worker-first routing for framework paths if L-S4 requires it, partial-route postponed state per L-S6, secrets and bindings from the Worker env into the HostContext, the caches.default CacheProvider with its documented limits, the cloudflare-kv session driver (passing the TASK-302 contract suite against a local namespace), an isolate-local rate limiter documented as weak, and `laroux preview --target workerd` through `wrangler dev`. When a server graph reaches @eserstack/ajan, the bundle imports the wasi-profile reactor as a Wasm module through the ajan `workerd` condition (TASK-318). The build fails when a server graph reaches node:ffi or an ajan binding outside the wasi profile (TASK-318's check, fixture-tested by TASK-314). Nothing is deployed.

The new modules ship beside the old pipeline (additive in 5.x). Rules: javascript-practices, security-practices where the section touches input, keys or output.

Plan key: L5e. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The conformance fixture passes in `wrangler dev`
- [ ] #2 The KV driver passes the session contract suite locally
- [ ] #3 A fixture whose server component calls a profile name through @eserstack/ajan builds and serves in `wrangler dev`, and a fixture that reaches a binding outside the profile fails the workerd build with a message naming the binding and the import chain
- [ ] #4 The laroux-server README documents the change, and the gate passes
<!-- AC:END -->
