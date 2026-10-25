---
id: TASK-267
title: Move the leaf libraries' remaining TypeScript logic to Go behind the bridge
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - go-delegation
  - ffi
  - logging
  - httpclient
milestone: m-6
dependencies:
  - TASK-241
priority: medium
ordinal: 267000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision go-ts-boundary, Go owns the business logic and the TypeScript libraries delegate to it through the bridge. Each of these packages keeps its public API and types; logic that exists only in TypeScript moves to the matching pkg/ajan *fx package and is reached through the M2-T7 dispatcher. One commit per package:
- crypto (cryptofx): business/crypto.ts and hash.ts beyond the hash call that already delegates
- parsing (parsingfx): the lexer and parser.ts against the Go tokenizer and combinators
- formats (formatfx): the csv, json, jsonl, toml and yaml codecs and stream-layers.ts
- config (configfx): the dotenv and file loaders against envparser and jsonparser
- cache (cachefx): xdg.ts and the directory logic in cache.ts
- logging (logfx): filters, formatters, sinks, category and tracer; the hot path stays synchronous (M2-T8)
- httpclient (pkg/ajan/httpclient): the interceptors and the TASK-129 retry policy, including the ServerErrorThreshold behavior in WIRING.md
- collector (collectorfx): manifest generation and specifier identifiers. The runtime.fs walk that laroux needs without the native library (TASK-184) stays in TypeScript

For each package, first write an audit table in its WIRING.md (collector has none yet) that marks every export as Go (already delegates), moved (moved to Go in this task) or TS, with the reason for TS: browser code, laroux client code, a thin adapter or a type.

Where a TypeScript implementation duplicates a Go path, delete it unless it is a kept fallback: browser code, or the path laroux needs without the native library. A target without a platform package (windows/arm64) runs on the WASM fallback (decision-45), so it is not a reason to keep a TypeScript duplicate; a call the WASM build cannot serve reports its error. List each kept fallback in WIRING.md with its reason. Each moved function gets a Go test in its *fx package and a TS test against the same fixtures. The packages keep @eserstack/ajan as a dependency.

WASM profile (decision-45): register every moved function that works on wasip1 in the wasi profile. A moved function must not pull net, crypto/tls, os/exec or the otel SDK into the profile; TASK-272's size and dependency checks enforce that. Logging works on WASM once TASK-278 makes OTel optional in logfx. httpclient works on WASM only through TASK-277's host fetch import; say so in its WIRING.md.

Decisions this task waits on: decision-22 (Where the Go and TypeScript boundary sits); decision-45 (ajan WASM fallback).

Plan key: M6-T1. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The WIRING.md of each of the eight packages has the audit table, with every export marked Go, moved or TS, and every TS row has a reason
- [ ] #2 Every function marked moved has a Go test in its *fx package and a TS test that reaches it through EserAjanCall, both run on the same fixture files
- [ ] #3 A diff of each package's emitted .d.ts from before and after the task shows no removed or changed public export
- [ ] #4 With ESER_AJAN=disabled, the tests of the kept fallbacks listed in WIRING.md pass, and a test checks that a function without a kept fallback throws the bridge's load error
- [ ] #5 laroux builds a fixture with ESER_AJAN=disabled
- [ ] #6 After each package's move, the wasi profile still passes TASK-272's size and dependency checks, and a parity test reaches each moved function that the profile serves through the WASM reactor
- [ ] #7 `eser ok` passes
<!-- AC:END -->
