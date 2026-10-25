---
id: TASK-293
title: 'laroux: /rsc runtime core (reference table, dispatch, envelope, keyring, sealing, request store, host port)'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-282
  - TASK-283
  - TASK-288
  - TASK-241
priority: medium
ordinal: 293000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 sections 3, 4.2, 4.4, 6 and 7.4. In @eserstack/laroux `/rsc`:
- the frozen, null-prototype server reference table; lookup before any body read with Object.hasOwn, function type, `$$typeof` and `$$id` checks; unknown ids never import a module
- the route-binding check from the binding manifest (or the root-bound fallback L-S1 decides)
- dispatchAction, dispatchFormPost and dispatchJson, with onAction hooks and pre middleware before decodeReply, unseal inside the handler wrapper, post middleware, the handler, output validation and effects capture
- the v1 envelope encoder with `tree`, `redirect` and `invalidate`, and the parallel-action rule
- the keyring (`LAROUX_KEYS`, `LAROUX_SECRET`), HKDF subkeys per purpose, AES-256-GCM and HMAC on WebCrypto, expiry rules and the cacheable-output rules of section 6.4, the build-kid startup check and the missing-keyring startup failure
- the request store, one AsyncLocalStorage per environment under `Symbol.for("laroux.requestStore:" + env)`
- the HostContext, CacheProvider, SessionDriver, RateLimiter and Keyring port types
- the startup check that react, react-dom and rsdw report the same exact version and meet the advisory floor
- the version ranges of decision-59: rsdw and @vitejs/plugin-rsc on a tilde range of the newest stable release when this task starts (~19.3.1 and ~0.5.38 on 2026-10-24; check npm again first), and react and react-dom peers from the same version

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4a. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Unit tests cover table lookups (unknown, `#`, `*`, empty and prototype-key ids), route binding, per-purpose key separation, tamper, expiry, retired kids and the build-kid check
- [ ] #2 A test shows a forged plaintext bound argument fails with 400 before the handler runs, on the RPC, `$h` and `$ACTION_REF_` paths
- [ ] #3 A test registers the request store twice in one environment and gets a startup error, and once each for rsc and ssr without one
- [ ] #4 The React contract suite of doc-3 section 21 runs against the runtime
- [ ] #5 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
