---
id: decision-8
title: 'What replaces deno compile for the eser, noskills and laroux binaries'
date: '2026-10-15 20:38'
status: accepted
---

## Context

deno compile builds 3 TS binaries for 5 targets, each embedding the Go library and WASM (80 to 130 MB). Node SEA has no macOS x64 support, needs single-file bundles, and its VFS is in early development. node:ffi (decision-37) can dlopen the Go library from a mounted SEA VFS only since Node 26.10.0. noskills-server is already a Go binary. Homebrew, Nix, install.sh and install.ps1 depend on the archives, and installed v4.5.x binaries self-update by name.

## Options

- eser as a Go binary (M3, a Go track parallel with M1 and M2), noskills as a Go binary (M4), laroux on npm only with a forwarding stub for installed binaries, no SEA
- Node SEA as a stopgap
- Drop standalone binaries and use npm only

## Recommendation

Go binaries for eser (M3) and noskills (M4), and laroux on npm only, with no SEA. Channels decide per release from the archives present, so nothing breaks at merge time.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Blocks

TASK-205 (M1-T11), TASK-226 (M1-T32), TASK-251 (M3-T10), TASK-254 (M3-T11), TASK-261 (M4-T6)

Plan key: `binaries`
