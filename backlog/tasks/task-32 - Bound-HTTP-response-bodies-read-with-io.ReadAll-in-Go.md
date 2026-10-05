---
id: TASK-32
title: Bound HTTP response bodies read with io.ReadAll in Go
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - ajan
  - performance
dependencies: []
references:
  - pkg/@eserstack/ajan/bridge.go
  - pkg/ajan/kitfx/fetcher.go
priority: medium
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Responses are read without a size limit at pkg/@eserstack/ajan/bridge.go:1552 and :1740 (bridgeHttpRequest, reachable from any TS caller with any URL), pkg/ajan/kitfx/fetcher.go:220,268,314, pkg/ajan/workflowfx/tools.go:235, pkg/ajan/aifx/adapter_ollama.go:113 and adapter_openai.go:262. Rule: coding-practices: Bound Every Resource; go-practices performance.md: Streaming and Buffering.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each site reads through io.LimitReader with a named limit and reports when the limit is hit
- [x] #2 The bridge limit is configurable per request or documented
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

go-libs-bridge: All of the unit's sites are done: kitfx (via httpGet), workflowfx http-fetch, bridgeHttpRequest, the error body of bridgeHttpRequestStream, and also the postsfx twitter and bluesky clients. The aifx sites belong to another unit. I fixed one bug in the verifier pass: lib.ReadAllLimited returned an empty body when limit was math.MaxInt64, because limit+1 overflowed. A regression test now covers it. maxResponseBytes is documented in bridge.go and in ffi/types.ts.

ai-cross: The aifx sites are verified. adapter_ollama.go GenerateText uses lib.ReadAllLimited(ollamaMaxResponseBytes = 16 MiB) and adapter_openai.go DownloadBatchResults uses lib.ReadAllLimited(openAIMaxBatchOutputBytes = 512 MiB). Both errors name the limit and the remedy. ParseJsonlStream now has jsonlMaxLineBytes and reports scanner errors. response_limits_test.go covers both. The bridge.go, kitfx and workflowfx sites, and AC #2, belong to go-libs-bridge, so partial is correct for this unit.
<!-- SECTION:NOTES:END -->
