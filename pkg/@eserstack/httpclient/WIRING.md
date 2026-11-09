# @eserstack/httpclient — FFI wiring notes

## Bridge calls

`go-client.ts` reaches the Go client, and `retry-policy.ts` the retry policy,
through the dispatcher ABI of `@eserstack/ajan` (names and types in
`ajan/ffi/bindings.ts`):

| Operation              | Bridge name                          | Request                                                                   |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| Create a client        | `lib.call("httpCreate", …)`          | the client options plus `timeoutMs`                                       |
| Send a request         | `lib.call("httpRequest", …)`         | `{ handle, method, url, headers?, body?, maxResponseBytes?, requestId? }` |
| Stream a response body | `lib.stream("httpRequestStream", …)` | the same request; `read()` answers `{ chunk?, done }`, `close()` releases |
| Release the client     | `lib.call("httpClose", handle)`      | the bare handle string                                                    |
| Resolve a retry plan   | `lib.call("httpRetryResolve", …)`    | `{ client?, request?, streamBody }`, the retry settings or `false`        |
| Decide after a failure | `lib.call("httpRetryNext", …)`       | `{ plan, attempt, status, retryAfterMs?, random }`                        |

`httpRequest` and `httpRequestStream` are blocking and async in the binding
table: the native library runs `httpRequest` in a pool worker and the stream's
open and reads in the stream's own worker thread, and the WASM fallback waits
on the host's fetch, so the client awaits them on every backend. The request's
`signal` goes to the call, the open and each read: it rejects the promise, and
for a stream read the table's cancel entry closes the stream, which ends the
Go read. An answer with an `error` field becomes a `GoHttpError`.

`httpClose` takes the handle itself. Until the dispatcher ABI the client sent
`{"handle":"…"}`, which matched no client, so client handles were never
released; `go-client.test.ts` covers the bare handle. The body stream closes
its Go handle once, at the end of the body, on a read error or on cancel, so
a body read to its end no longer leaves its handle behind.

The two retry names are synchronous and go through `requireLibSync()`, which
loads the library on first use. Numbers cross as JavaScript numbers: NaN and
the infinities, which JSON has no number for, travel as the strings `"NaN"`,
`"Infinity"` and `"-Infinity"` (`WireNumber`, `resilience.JSNumber` in Go).

## Audit (TASK-267)

Every export of the package, and where its logic runs. Go: it already
delegated to the bridge. Moved: its logic moved to Go in TASK-267. TS: it stays
in TypeScript, for the reason given.

| Export                                                                                                                                                                                                                         | Module            | Status | Reason                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HttpClient`, `createHttpClient`: the retry policy                                                                                                                                                                             | `client.ts`       | moved  | How many attempts a request gets, whether a failed attempt is retried and how long to wait (backoff, jitter, cap, a 429's Retry-After) run in Go: `resilience.ResolveRetryPlan` and `RetryPlan.Next`, through `httpRetryResolve` and `httpRetryNext`. The defaults table, the merge of client and request settings and the backoff are deleted from TypeScript. |
| `HttpClient`, `createHttpClient`: the attempt loop, URL, headers, body, timeout signal, response parsing, error building                                                                                                       | `client.ts`       | TS     | Caller-supplied functions: the loop runs the request interceptors and `fetchFn` before every attempt and the response interceptors after, so it stays where those functions are. The rest is a thin adapter over `Request`, `Response`, `Headers` and `AbortSignal`.                                                                                            |
| `HttpClient` with `transport: "native"`: the exchange                                                                                                                                                                          | `go-transport.ts` | Go     | `createGoFetch` sends each attempt through `httpRequest` or `httpRequestStream`; the Go client is created with its own retries off, so the policy above is the only one that runs.                                                                                                                                                                              |
| `parseRetryAfter`                                                                                                                                                                                                              | `client.ts`       | TS     | The HTTP-date form is read with JavaScript's `Date` parser and `Date.now()`, which accept more forms than Go's `http.ParseTime` (three layouts); moving it would change which headers parse. The policy gets its result as a number.                                                                                                                            |
| `extractRateLimitInfo`                                                                                                                                                                                                         | `client.ts`       | TS     | Thin adapter: reads four headers of a `Headers` object into numbers.                                                                                                                                                                                                                                                                                            |
| `HttpClientError`, `HttpResponseError`, `HttpRateLimitError`, `HttpTimeoutError`, `HttpAbortError`, `HttpNetworkError`                                                                                                         | `errors.ts`       | TS     | Thin adapters: JavaScript error classes.                                                                                                                                                                                                                                                                                                                        |
| `classifyError`, `classifyHttpStatus`, `classifyAndWrap`                                                                                                                                                                       | `errors.ts`       | TS     | Thin adapters: they pick an error class from a runtime error's `name` (the `TimeoutError` and `AbortError` DOMExceptions), fetch's messages or a status. `classifyHttpStatus` is not the retry policy.                                                                                                                                                          |
| `HttpClientErrorOptions`                                                                                                                                                                                                       | `errors.ts`       | TS     | Type.                                                                                                                                                                                                                                                                                                                                                           |
| `InterceptorChain`, `applyRequestInterceptors`, `applyResponseInterceptors`                                                                                                                                                    | `interceptors.ts` | TS     | Caller-supplied functions: interceptors are JavaScript functions, which cannot cross the bridge; the chain is a list of them.                                                                                                                                                                                                                                   |
| `createGoHttpClient`, `createGoHttpClientFor`, `GoHttpClient`                                                                                                                                                                  | `go-client.ts`    | Go     | Calls `httpCreate`, `httpRequest`, `httpRequestStream` and `httpClose`; the TypeScript part decodes the answers and wraps the stream.                                                                                                                                                                                                                           |
| `GoHttpError`                                                                                                                                                                                                                  | `go-client.ts`    | TS     | Thin adapter: the error class for a Go error answer.                                                                                                                                                                                                                                                                                                            |
| `GoHttpMethod`, `GoHttpClientOptions`, `GoHttpRequest`, `GoHttpResponse`, `GoHttpStreamResponse`, `GoHttpErrorPayload`                                                                                                         | `go-client.ts`    | TS     | Types.                                                                                                                                                                                                                                                                                                                                                          |
| `createH3FetchFn`                                                                                                                                                                                                              | `h3-fetch.ts`     | TS     | Thin adapter: returns the runtime's `fetch`.                                                                                                                                                                                                                                                                                                                    |
| `HttpMethod`, `RateLimitInfo`, `HttpResponse`, `HttpStreamResponse`, `RequestInterceptor`, `ResponseInterceptor`, `Interceptors`, `RetryConfig`, `HttpTransport`, `HttpClientConfig`, `RequestOptions`, `Result`, `Ok`, `Fail` | `types.ts`        | TS     | Types.                                                                                                                                                                                                                                                                                                                                                          |

### Kept fallbacks

None. The retry policy has one implementation, in Go, and both transports ask
it; nothing of it is left in TypeScript. No browser or laroux code imports this
package: `@eserstack/posts` (the Twitter and Bluesky adapters) and
`@eserstack/ai` (the Ollama adapter) are its only importers in the repository,
both server-side, and `mod.ts` already loads Node modules through
`@eserstack/ajan/ffi/client`, so the package does not load in a browser as it
is. With `ESER_AJAN=disabled`, `bridge.test.ts` checks that requests reject with
the bridge's load error before anything is sent, while the TypeScript rows
above still work, and laroux-bundler's `system.test.ts` passes.

### The two Go retry policies

HttpClient's policy (`resilience.RetryPlan`, the `RetryConfig` fields) and the
Go client's own retries (`GoHttpClientOptions.retryEnabled`, which
`ResilientTransport` runs: every status at or above `ServerErrorThreshold`, a
jitter of 10% either way, a circuit breaker) are different policies behind
different public options; neither replaces the other without changing the
behavior of one of them. They never both run on one request: HttpClient creates
its Go client with retries off (`go-transport.test.ts` checks the create
options). The Go client's retries have two loops, `ResilientTransport.RoundTrip`
in `pkg/ajan/httpclient` for the native library and `wasiHTTPClient.do` in
`bridge_http_wasi.go` for the WASM build, which mirrors it on the shared
`resilience` breaker and strategy (TASK-277).

## WASM

`httpRetryResolve` and `httpRetryNext` are pure and are in the wasi profile, so
the retry policy answers on the WASM fallback like on the native library
(`wasm/profile-parity.test.ts`, and `bridge.test.ts` runs the fixture on the
reactor). The requests themselves reach the network on the WASM fallback only
through TASK-277's host fetch import: the reactor calls the host's `fetch`
through JSPI, never `net`, and without JSPI the `http*` exchange names answer an
error. The default `fetch` transport sends with the runtime's `fetch` and needs
the WASM build only for the policy.

## Behavior changes (TASK-267)

- Every request needs the bridge, on the default `fetch` transport too. Without
  it, a request rejects with an `HttpClientError` whose message starts with
  "HttpClient runs its retry policy in Go through @eserstack/ajan:" followed by
  the bridge's "eser-ajan native library unavailable: …", with the load error as
  `cause`, before the request is built or sent; the Result methods return it as
  a `Fail`. Before, only `transport: "native"` needed it.
- A `RetryConfig` field set to `undefined` or `null` takes its default. Before,
  an explicit `undefined` replaced the default: `initialDelay: undefined` gave
  NaN delays, `retryableStatuses: undefined` a TypeError on the first failure.
- A value outside the `RetryConfig` types (a non-boolean `jitter`, a string
  delay, `retry: true`) is refused with an `HttpClientError` naming the field
  Go could not read. Before, it was coerced (`retry: true` meant the defaults).
- `Math.random` is called once per failed attempt, for the decision's jitter,
  instead of only when a jittered backoff is computed. Nothing observable
  changes.
- The backoff's power is Go's `math.Pow` instead of `Math.pow`. They agree on
  every fixture case; for a fractional `factor` they may differ in the last bit,
  which shows only when the delay sits exactly on a half before rounding.

## Behavioral divergences

### httpclient.bridgeHttpCreate: ServerErrorThreshold lost via WithConfig

- **Status**: RESOLVED
- **Location**: `pkg/@eserstack/ajan/bridge_http.go` function `bridgeHttpCreate`
- **Was**: `NewClient(WithConfig(cfg))` uses `cfg` as given, and the bridge
  built `cfg` without `ServerErrorThreshold`, so it was 0: with
  `retryEnabled: true` every response, 2xx included, counted as a server error,
  and every request exhausted its attempts and returned `ErrMaxRetries`.
- **Now**: `bridgeHttpCreate` sets `ServerErrorThreshold` to
  `httpclient.DefaultServerErrorThreshold` (500), and the WASM client
  (`bridge_http_wasi.go`) uses the same 500. `bridge_http_error_test.go` covers
  the retry count and the 2xx, 404 and 429 answers with retries on. The
  threshold concerns the Go client's own retries only; HttpClient's policy
  retries the statuses in `retryableStatuses` and never sets it.
