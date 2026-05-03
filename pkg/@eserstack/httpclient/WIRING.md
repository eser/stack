# @eserstack/httpclient — FFI wiring notes

## Behavioral divergences

### httpclient.bridgeHttpCreate — ServerErrorThreshold lost via WithConfig

- **Status**: RESOLVED
- **Location**: `pkg/@eserstack/ajan/bridge.go` function `bridgeHttpCreate`
- **Go behavior**: `httpclient.Client` created via `NewClient(WithConfig(cfg))` has `ServerErrorThreshold` unset (zero/default) even when the incoming request specifies it. Root cause: `WithConfig` replaces the entire config pointer rather than merging fields, so any option set before `WithConfig` is discarded, and any option not set in the passed `cfg` takes the zero value.
- **TS behavior**: Not directly applicable — the TS layer only sends `ServerErrorThreshold` when consumers configure it; the value is expected to round-trip.
- **Symptom**: Non-2xx status classification thresholds sent from TS do not take effect on the Go client. Retry and error classification behavior downstream may be affected. Specifically, when `retryEnabled: true`, the transport treats every response (including 2xx) as a server error because `ServerErrorThreshold = 0`, causing all retried requests to exhaust attempts and return `ErrMaxRetries`.
- **Proposed fix**: Apply `ServerErrorThreshold` (and any other affected fields) via a dedicated option after `WithConfig`, or change `WithConfig` to merge rather than replace. Scope: ~1-3 line change in `bridgeHttpCreate` plus regression tests.
- **Awaiting**: Eser approval to fix as a separate task.
