---
id: TASK-278
title: 'logfx: make OpenTelemetry optional and add logging to the WASM profile'
status: Done
assignee: []
created_date: '2026-10-24 00:20'
updated_date: '2026-10-24 18:59'
labels:
  - go
  - logging
  - wasm
milestone: m-2
dependencies:
  - TASK-273
priority: medium
ordinal: 278000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision-45, logging should work on the WASM fallback without the OpenTelemetry SDK. logfx's logger.go, handler.go, noop.go and tracer.go all import OTel types today, so adding the log names to the wasi profile costs 2.36 MB and 128 packages (9.61 MB in all, +0.48 ms per call in command mode).

- Define the trace context and tracer seam logfx needs as its own small interface, keep the OTel-backed implementation in a separate package or file set that only native builds and services link, and keep a no-op default.
- Keep logfx's public API for existing Go callers; where a signature takes an OTel type, add the new type and leave the old entry point in the OTel package.
- Add the log names (logCreate, the write and level calls, logClose) to the wasi profile.

TASK-267 later moves @eserstack/logging's remaining TypeScript logic to logfx, so this decides whether @eserstack/logging works on the WASM fallback.

Plan key: M2-T12. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `go list -deps` for logfx's base package, built for wasip1, contains no go.opentelemetry.io/otel/sdk package
- [x] #2 The wasi profile with logging passes TASK-272's size and dependency checks
- [x] #3 A TS test under `--no-experimental-ffi` creates a logger, writes through it on later calls and closes it, all on one reactor instance
- [x] #4 Existing logfx, httpfx and noskillsserverfx tests pass, and services still export traces through the OTel package
- [x] #5 The gate passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. logfx links the OpenTelemetry API only: Logger.EnableOTLP and the OTLPConnectionResource and OTLPLogExporter interfaces (the only SDK-typed signatures, with no callers in the repo) moved to the new package logfx/otlp (otlp.Enable(logger, conn), otlp.ConnectionResource, otlp.LogExporter); logfx gained TelemetryProviders and Logger.EnableTelemetry, which take the API providers (nil keeps the current one). The no-op defaults stay. The API alone still pulled net/http and crypto/tls (2 MB) through the propagation package, so PropagatorExtract and PropagatorInject moved to logger_propagation.go (//go:build !wasip1) with a package-level W3C TraceContext+Baggage propagator; the unused Logger.InnerPropagator field is gone. GOOS=wasip1 go list -deps ./logfx has no otel/sdk, net or crypto/tls package. bridge_log.go is in the profile (logCreate, logWrite, logClose, logShouldLog, logConfigure; 49 names). Profile: 7,771,927 B raw, 1,498,730 B brotli (+476 KB raw), under the 8,000,000 and 1,600,000 limits; net/http joined AJAN_WASM_FORBIDDEN. Tests: logfx/otlp/otlp_test.go exports a span and a log record (carrying the span id) through SDK providers with in-memory exporters, so services keep exporting traces through the OTel package; wasm/node-reactor-log.test.ts runs wasm/node-reactor-log.fixture.ts under node --no-experimental-ffi (with ESER_AJAN_NATIVE=disabled, since the Node backend is still koffi until node:ffi replaces it, decision-37) and checks that the loader fell back to the reactor (UNSUPPORTED_IN_WASM on a non-profile name), creates a logger, writes three records on later calls (they reach stderr through node:wasi), filters a DEBUG write, closes it, and gets 'handle not found' after close; profile-parity.test.ts covers the five log names. Side fix found by that test: every bridge log record carried "scope" twice (bridge_log.go bridgeLogCreate adds it with logger.With and bridgeLogWrite prepended it again to the attrs it logs); the default path now leaves the prepended one out, the filters still see it; failing test first (TestBridgeLogWrite_ScopeAppearsOnce, with a logOutput seam). READMEs: logfx (Upgrading entry for EnableOTLP and InnerPropagator), connfx, ajan. Existing logfx, httpfx and noskillsserverfx tests pass; deno task cli ok passed.
<!-- SECTION:NOTES:END -->
