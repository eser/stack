# @eserstack/httpclient — FFI wiring notes

## Bridge calls

`go-client.ts` reaches the Go client through the dispatcher ABI of
`@eserstack/ajan` (names and types in `ajan/ffi/bindings.ts`):

| Operation              | Bridge name                          | Request                                                                   |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| Create a client        | `lib.call("httpCreate", …)`          | the client options plus `timeoutMs`                                       |
| Send a request         | `lib.call("httpRequest", …)`         | `{ handle, method, url, headers?, body?, maxResponseBytes?, requestId? }` |
| Stream a response body | `lib.stream("httpRequestStream", …)` | the same request; `read()` answers `{ chunk?, done }`, `close()` releases |
| Release the client     | `lib.call("httpClose", handle)`      | the bare handle string                                                    |

`httpRequest` and `httpRequestStream` are async in the binding table: on the
WASM fallback they wait on the host's fetch, so the client awaits them on
every backend. An answer with an `error` field becomes a `GoHttpError`.

`httpClose` takes the handle itself. Until the dispatcher ABI the client sent
`{"handle":"…"}`, which matched no client, so client handles were never
released; `go-client.test.ts` covers the bare handle. The body stream closes
its Go handle once, at the end of the body, on a read error or on cancel, so
a body read to its end no longer leaves its handle behind.

## Behavioral divergences

### httpclient.bridgeHttpCreate — ServerErrorThreshold lost via WithConfig

- **Status**: RESOLVED
- **Location**: `pkg/@eserstack/ajan/bridge_http.go` function `bridgeHttpCreate`
- **Go behavior**: `httpclient.Client` created via `NewClient(WithConfig(cfg))`
  has `ServerErrorThreshold` unset (zero/default) even when the incoming request
  specifies it. Root cause: `WithConfig` replaces the entire config pointer
  rather than merging fields, so any option set before `WithConfig` is
  discarded, and any option not set in the passed `cfg` takes the zero value.
- **TS behavior**: Not directly applicable — the TS layer only sends
  `ServerErrorThreshold` when consumers configure it; the value is expected to
  round-trip.
- **Symptom**: Non-2xx status classification thresholds sent from TS do not take
  effect on the Go client. Retry and error classification behavior downstream
  may be affected. Specifically, when `retryEnabled: true`, the transport treats
  every response (including 2xx) as a server error because
  `ServerErrorThreshold = 0`, causing all retried requests to exhaust attempts
  and return `ErrMaxRetries`.
- **Proposed fix**: Apply `ServerErrorThreshold` (and any other affected fields)
  via a dedicated option after `WithConfig`, or change `WithConfig` to merge
  rather than replace. Scope: ~1-3 line change in `bridgeHttpCreate` plus
  regression tests.
- **Awaiting**: Eser approval to fix as a separate task.
