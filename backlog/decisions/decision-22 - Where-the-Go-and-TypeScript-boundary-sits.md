---
id: decision-22
title: Where the Go and TypeScript boundary sits
date: '2026-10-15 20:38'
status: accepted
---

## Context

The owner's direction, revised on 2026-10-15: move business logic and the working parts to Go as much as possible. Today 17 TypeScript packages depend on @eserstack/ajan and call Go per operation through 100 hand-listed FFI exports, most with a TypeScript fallback. Every npm install pulls a platform package with the native library (about 35 MB) or the WASM build (about 22 MB).

The previous recommendation retired the bridge in M6 and left the remaining libraries as pure TypeScript. That moves logic away from Go, the opposite of the direction. The bridge is how a TypeScript library hands its logic to Go inside the process, and node:ffi now makes it a Node built-in from 26.9 on (decision-37), so keeping it no longer needs a native npm dependency.

## Options

- Go owns the business logic and the working parts. TypeScript libraries keep their public API and types and delegate to Go through the bridge, which stays. Logic that exists only in TypeScript moves to the matching pkg/ajan *fx package in M6
- Go owns only the binaries; the TypeScript libraries become pure TypeScript and the bridge is retired in M6 (the previous recommendation)
- A Go sidecar speaking JSON-RPC over stdio

## Recommendation

The first option. Go owns the binaries (eser, noskills, noskills-server), the working parts (CLIs, hooks, validators, release tooling, scaffolding, the daemon) and the business logic, which lives in the pkg/ajan *fx packages. The Go binaries use those packages directly (M3 to M5). TypeScript libraries keep their public API and types and delegate their logic to Go through the bridge; M6 moves what exists only in TypeScript, package by package, wherever Go can own it. Browser code, React and laroux client code, thin adapters and types stay in TypeScript. The bridge, its platform packages and its Go module (github.com/eser/ajan) stay, so the repo keeps two go.mod files.

No sidecar: it adds a process per consumer, a startup cost and a lifecycle to manage, while the in-process bridge with worker threads for blocking calls (M2-T8) covers the same cases.

## Decided by

The owner accepted the first option on 2026-10-15. Record it in ADR 0005 (M0-T1).

## Blocks

TASK-238 (M2-T7), TASK-255 (M3-T12), TASK-267 (M6-T1), TASK-268 (M6-T2), TASK-269 (M6-T3)

Plan key: `go-ts-boundary`
