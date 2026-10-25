---
id: m-2
title: "M2 Releasable on Node"
---

## Description

Make the new toolchain publishable and safe: no JSR-hosted dependencies, npm library emit, real laroux packaging, the test-kit on node:assert, a small dispatcher ABI for the Go bridge with blocking calls in worker threads so the event loop stays free, and prepared patches for the external template and tap repos.

Exit criteria:
- No @std/* or @jsr/* dependency in any package.json, and .npmrc has no @jsr line
- Preflight packs every library, installs all tarballs together into a scratch Node 26 project with overrides for the workspace ranges, and imports every export entry
- `laroux dev`, `laroux build` and `laroux serve` pass a CI smoke test from the packed npm package, with one React copy and one action registry
- pkg/@eserstack/ajan/main.go exports only EserAjanVersion, EserAjanCall, EserAjanStreamOpen, EserAjanStreamRead, EserAjanStreamClose and EserAjanFree, and the parity test matches the TS binding table against the Go registry
- Regression tests show that 8 concurrent blocking calls keep timers and fs responsive, that an unrelated fs read stays under 100 ms with 4 PTY panes and an AI stream open, that an AbortSignal cancels in-flight AI and HTTP stream calls, and that 50 teardown runs with live workers exit cleanly
- CI runs the FFI suites and the worker tests on the pinned Node minor and on every change to it
- The patches for the laroux template repos and the homebrew-tap are with the owner
- CHANGELOG Unreleased, Migration lists every consumer-facing break, and the owner has the release checklist
