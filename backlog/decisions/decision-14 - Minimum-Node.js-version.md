---
id: decision-14
title: Minimum Node.js version
date: '2026-10-15 20:38'
status: accepted
---

## Context

Node 26 becomes Active LTS on 2026-10-28 and is supported until 2029-04-30. It has stable type stripping, import.meta.main and dirname, and Temporal. The npm bundles target node18 today, and the mux worker already needs Node 26.

The Go bridge now loads natively only through node:ffi, with the WASM build as its fallback (decision-37, decision-45). node:ffi arrived in 26.1.0 behind `--experimental-ffi` and is on by default since 26.9.0 (2026-09-16, nodejs/node#65475). It is still "Stability: 1 - Experimental", `--no-experimental-ffi` turns it off, and under the permission model it needs `--allow-ffi`. So 26.9 is the lowest version where the bridge loads with no extra flag. Because the module is experimental, a later minor can change it. The only fallback is the WASM build (decision-45), which serves a subset of the calls. Since 26.10.0, `dlopen` also accepts paths inside a mounted SEA VFS.

## Options

- `>=26.9` in engines, with the exact minor that passed the M0-T2 spike pinned in .node-version and every CI job
- `>=26`: node:ffi needs `--experimental-ffi` on 26.1 to 26.8, so every entry point would have to pass the flag
- `>=24` or `>=22`: no node:ffi, so the bridge could load only the WASM build

## Recommendation

`>=26.9` in every package.json engines field and in the bundle targets. .node-version and every CI job pin the exact Node minor on which the M0-T2 spike passed. A Node minor bump is its own change and must pass the FFI suites and the worker tests (M2-T8) before it merges.

## Decided by

The owner accepted `>=26.9` on 2026-10-15. Record it in ADR 0005 (M0-T1).

## Blocks

TASK-189 (M0-T13), TASK-190 (M0-T14), TASK-202 (M1-T8), TASK-232 (M2-T1)

Plan key: `node-floor`
