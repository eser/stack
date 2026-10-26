---
id: decision-52
title: laroux deploy targets
date: '2026-10-23 21:05'
status: accepted
---

## Context

doc-2's output contract targeted Node only, with workerd behind spike S12. The repo ships a cf-workers-app recipe. workerd has no node:ffi, so code that reaches the ajan bridge cannot run there, and the ajan WASM build is about 22 MB.

## Options

- Node only, with Cloudflare Workers after S12
- Node and Cloudflare Workers from the first release

## Decision

Node and Cloudflare Workers from the first release. `laroux build` gains a workerd target: the server graphs build for workerd with nodejs_compat, dist/client is served through Workers static assets, and wrangler deploys it with no Vite plugin. S12 is no longer optional and runs with S1. CI builds and serves a laroux-native app and a Start app on both targets. Code reachable from the server graphs must not need the ajan bridge on workerd; how the eserstack libraries keep that true after M6 is an open question for the owner.

## Decided by

The owner decided on 2026-10-23.

## Blocks

Track L tasks TASK-280 to TASK-318 (doc-3), TASK-267 and TASK-268 (M6 moves to Go).

Plan key: `laroux-deploy-targets`

## Amended

2026-10-24: the "about 22 MB" WASM figure is stale. The WASM fallback is now one wasi-profile reactor of 7.26 MB (1.41 MB brotli) with microsecond calls (decision-45). The open question about eserstack libraries on Workers after M6 is answered: the owner chose the wasi-profile reactor on workerd for the profile's names, and a build failure for everything outside the profile (decision-45, amended; TASK-318). decision-53 removed the Start app from the CI requirement; CI builds and serves a laroux-native app on both targets.
