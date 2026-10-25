---
id: m-6
title: "M6 Remaining business logic moves to Go behind the bridge"
---

## Description

Move the business logic that still exists only in TypeScript to the matching pkg/ajan *fx package, package by package, and have the TypeScript libraries reach it through the bridge. The libraries keep their public API and types; browser code, React and laroux client code, thin adapters and types stay in TypeScript. shell and ai keep their Go paths. The bridge, its platform packages, the WASM fallback (decision-45) and the second Go module stay.

Exit criteria:
- Every package that depends on @eserstack/ajan has a WIRING.md audit table that marks each export as Go, moved or TS, with a reason on every TS row and a list of kept fallbacks
- Every function moved to Go has a Go test in its *fx package and a TS test that reaches it through EserAjanCall on shared fixtures
- The WASM fallback is built and tested in CI on every release, and each name it cannot serve returns UNSUPPORTED_IN_WASM (decision-45)
- go.mod and pkg/@eserstack/ajan/go.mod both remain, and the gate lints and tests both Go modules
- The cross-runtime facade decision is applied and recorded; docs and skills describe the final Go/TS boundary; the gate is green
