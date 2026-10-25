---
id: TASK-279
title: 'aifx: implement the providers on net/http and drop the vendor SDKs'
status: In Progress
assignee: []
created_date: '2026-10-24 00:20'
updated_date: '2026-10-25 15:33'
labels:
  - go
  - ai
  - dependencies
  - performance
milestone: m-6
dependencies: []
priority: medium
ordinal: 279000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision-55, aifx stops using anthropic-sdk-go, openai-go and google.golang.org/genai. The chain is 26.3 MB of the 38.6 MB bridge dylib on every platform package (12.3 MB without it), and it adds gRPC, protobuf and Google auth.

- Write each provider (Anthropic, OpenAI, Gemini, Vertex AI) on net/http: request building, JSON and SSE stream decoding, tool calls, the options aifx exposes and the error mapping, including cancellation through the context. Vertex AI auth uses a small token source instead of cloud.google.com/go/auth; record what credential sources it supports in the aifx README.
- Record each provider's request and response fixtures from the current SDK path first, and test the new code against them, so behavior stays the same.
- Remove the SDK modules from both go.mod files and run `go mod tidy`.
- Keep aifx out of the WASM profile. After TASK-277, joining it is a separate owner decision on its size cost.

TASK-268 then checks the TypeScript adapters against this aifx.

Plan key: M6-T5. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For each provider, fixture tests cover text generation, streaming, tool calls, an API error and cancellation
- [ ] #2 The darwin/arm64 bridge dylib is at most 14 MB, measured in CI and recorded in the task notes
- [x] #3 The ai package's *.ffi.test.ts suites pass through adapters/ajan-bridge.ts
- [x] #4 The gate passes, including lint and tests for both Go modules
- [x] #5 `go list -deps` of the bridge (native and wasip1) and of cmd/eser, cmd/noskills and cmd/noskills-server links none of anthropic-sdk-go, openai-go, google.golang.org/genai or google.golang.org/grpc
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done by a delegated agent, checked here).
The aifx providers (Anthropic, OpenAI with batches, Gemini, Vertex AI) are rewritten on net/http:
- provider_http.go: retries, Retry-After under 60 s, per-attempt timeout, size limits, typed errors; sse.go: the stream decoder.
- Wire types per provider; google_client.go and google_credentials.go (the Vertex token source). Supported credential sources are listed in the new aifx README.
- anthropic-sdk-go, openai-go and genai are dropped from both go.mod files, then go mod tidy.
AC #2: 87 fixtures recorded from the old SDK adapters against httptest (AIFX_RECORD_FIXTURES=1), then replayed against the new code, comparing requests (headers, body by value, JWT claims) and outcomes. Every provider covers text, all options, streaming, tool calls, API errors and cancellation. Plus retries, timeouts, batch operations, and the Vertex auth paths (API key, service account, metadata server). The cancellation tests passed on the SDK code before the rewrite.
AC #4: deno test -A pkg/@eserstack/ai after make ajan-lib: 209 passed, both *.ffi.test.ts suites included.
AC #3: darwin/arm64 dylib 38,699,954 -> 12,606,610 bytes (3,722,313 brotli), verified here (wc -c). Measured locally only; the CI measurement is still open.
AC #1 is not met as written; owner decision needed:
- go list -deps (what links) shows no AI SDK in either module, and nothing gRPC in the bridge.
- In the root module, go list -m all still lists anthropic-sdk-go, openai-go and genai, because the golangci-lint tool directive pulls them in through securego/gosec v2.28.0 ('go mod why' says the main module does not need them). grpc is listed and linked in the root by connfx's OTLP gRPC exporters (pkg/ajan, api/adapters/appcontext, connfx).
- In the bridge, grpc appears only through the root module's go.mod.
- Meeting the AC literally means moving golangci-lint out of the tool directive (for example the pinned build in etc/temp only) and replacing connfx's OTLP gRPC exporters with OTLP/HTTP. Both are outside this task.
Behaviour changes:
- An OpenAI tool-result message had content and tool_call_id swapped (adapter_openai.go:799); fixed, and the two fixtures corrected with notes.
- SSE keep-alive events with no data are skipped; the OpenAI SDK failed on them.
- Gemini and Vertex now apply RequestTimeout (60 s bridge default) and honour BaseURL.
- Retry waits stop when the context ends. SDK telemetry headers are no longer sent.
- Error texts have the same shape with URLs redacted.
- Vertex ADC is narrower than cloud.google.com/go/auth: no external_account or impersonation (google_credentials.go:264).
Also: bridge go.sum gained two indirect test-only entries (kr/pretty, gopkg.in/check.v1) from tidy. make ajan-wasm-check passes (7,929,140 bytes, 1,529,464 brotli). Both modules' lint and tests pass. AC #5 waits on a clean full gate (the noskills agent's work in progress).

2026-10-25: deno task cli ok and make ok passed. Stays In Progress for AC #1 (owner decision, see above) and AC #3's CI measurement.

2026-10-25, owner decision: rewrite AC #1 to what decision-55 is about, and also offer OTLP over gRPC.
- Correction to the earlier note: connfx never used OTLP gRPC exporters; it exported over HTTP already. grpc is in the root module graph because go.opentelemetry.io/proto/otlp's collector packages, which the HTTP exporters import, carry the generated gRPC stubs. So go list -m all lists it with any official OTel exporter.
- AC #1 is replaced by AC #5, which counts what links. go list -deps of the bridge (native and GOOS=wasip1), cmd/eser, cmd/noskills and cmd/noskills-server shows 0 packages of anthropic-sdk-go, openai-go, genai or grpc. No binary in the repo links connfx.
- connfx: the otlp factory picks its transport from the 'transport' property, else OTEL_EXPORTER_OTLP_PROTOCOL, else http/protobuf (the default, as in the OTel spec). 'grpc' uses otlptracegrpc, otlpmetricgrpc and otlploggrpc (new dependencies at the existing versions, v1.46.0 and v0.22.0, approved by the owner). http/json and other values are refused with ErrUnsupportedOTLPTransport. GetLogExporter and GetMetricExporter now return sdklog.Exporter and sdkmetric.Exporter (CHANGELOG migration entry). Test: connfx/adapter_otlp_test.go covers both transports, precedence, refusal and building a resource. README updated.
- AC #2: new 'make ajan-lib-check' fails over AJAN_LIB_MAX_BYTES (14,000,000) or when the library links an AI SDK or gRPC. Locally the darwin/arm64 dylib is 13,548,306 bytes; it grew from 12,606,610 with this session's other bridge work. The CI step is a patch, etc/temp/ci/task-279-ci.patch (the macOS Deno row of cross-runtime-test runs make ajan-lib-check), waiting for the owner. AC #2 closes after it runs in CI.

2026-10-25: the owner approved applying etc/temp/ci/task-279-ci.patch; applied to .github/workflows with task-265-ci.patch, actionlint clean, both gates pass. AC #2 is checked once the macOS row of that job has run in CI and its measured size is recorded here.
<!-- SECTION:NOTES:END -->
