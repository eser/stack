---
id: TASK-129
title: Run interceptors and the retry policy on the httpclient native path
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - httpclient
  - bug
dependencies: []
references:
  - pkg/@eserstack/httpclient/client.ts
  - pkg/@eserstack/httpclient/go-client.ts
  - pkg/@eserstack/httpclient/README.md
priority: medium
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
HttpClient.request() and requestStream() go through the Go client (#executeViaGoClient and #executeStreamViaGoClient, pkg/@eserstack/httpclient/client.ts:180, :241, :705, :778) whenever @eserstack/ajan loads and no fetchFn is set. That path skips request and response interceptors and RetryConfig and reports retries: 0 (line 833), while the verb methods always use fetch, so the same call behaves differently by method. A ReadableStream request body is also reused across retry attempts. GoHttpClientOptions timeout and retries do not match the Go fields (timeoutMs, maxAttempts), so they are ignored.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Interceptors and retries behave the same on the native and fetch paths, or the native path is limited to calls without them
- [x] #2 Stream bodies are not retried, or are re-created per attempt
- [x] #3 GoHttpClientOptions fields reach the Go client
- [x] #4 Tests cover both paths; the README Native Client section matches
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-b: Checked against the code and tests:
- request() and requestStream() use _executeFetch.
- transport "native" swaps only the exchange step, through go-transport.createGoFetch.
- A ReadableStream body sets maxAttempts to 1 and gets duplex: "half".
- GoHttpClientOptions field names match httpCreateRequest's JSON tags in pkg/@eserstack/ajan/bridge.go.
- GoHttpRequest.maxResponseBytes matches httpRequestInput.
- go-transport.test.ts covers interceptors, retries, 429 and network errors on the native path, client.test.ts covers the stream body and the default transport, and go-client.test.ts covers the timeoutMs RangeError and timeoutMs reaching Go.
- The README Native Client section matches the code.
<!-- SECTION:NOTES:END -->
