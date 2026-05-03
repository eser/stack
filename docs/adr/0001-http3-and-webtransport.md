# ADR 0001 — HTTP/3 + WebTransport as the noskills-server public transport

**Status**: Accepted  
**Date**: 2026-04-30  
**Deciders**: Eser Ozvataf

---

## Context

`noskills-server` is a coordinator daemon that manages project workspaces,
persists spec/state via `pkg/ajan/noskillsfx`, spawns long-lived Claude Code
sessions, and must serve CLI, TUI, and browser clients from the same endpoint.

The daemon needs:
1. A **REST surface** for project/session/spec management (request/response).
2. A **bidirectional streaming surface** for live session attach (multi-client
   fan-out, permission requests, transcript replay).
3. A **datagram surface** for lossy signals (presence, typing indicators).

Two transport bundles were evaluated:

### Option A — HTTP/1.1 + HTTP/2 + WebSocket

- TCP-based. Long-lived TCP connections are stateful; load-balancers must use
  sticky sessions for WebSocket.
- WebSocket gives bidi streaming but is a separate protocol upgrade path with
  its own frame format; datagrams require a separate DataChannel or polling.
- HTTP/2 multiplexes streams but still suffers head-of-line blocking at the TCP
  layer when packets reorder.
- All existing `httpfx` middleware already works here — zero new code needed.

### Option B — HTTP/3 + WebTransport (chosen)

- QUIC-based. UDP transport; no TCP head-of-line blocking. Streams are
  independent per QUIC stream, so one stalled response doesn't block others.
- WebTransport (W3C + IETF) provides bidi streams **and** unreliable datagrams
  as native transport primitives over the same QUIC connection. No protocol
  switching; no separate WebSocket upgrade.
- Chromium-based browsers negotiate `h3` ALPN automatically — `fetch()` and
  `new WebTransport()` both work without any client-side configuration.
- `quic-go` (`github.com/quic-go/quic-go`) is a mature pure-Go implementation
  used in production by Caddy, Cloudflare, and IPFS. No cgo.
- `webtransport-go` (`github.com/quic-go/webtransport-go`) wraps the same QUIC
  connection for WebTransport semantics with a single `ConfigureHTTP3Server`
  call.

## Decision

Use **HTTP/3 + WebTransport (Option B)** as the sole public transport for
`noskills-server`.

Key implementation points:

- A new **`HTTP3Service`** (sibling to `HTTPService`) wraps `http3.Server` and
  shares the same `Router.GetMux()`, so all existing routes (REST handlers,
  middleware chain) work over HTTP/3 unchanged.
- **`Router.RouteRaw`** is a new escape hatch that registers a raw
  `http.HandlerFunc` directly on the mux. Used for `/attach/{slug}/{sid}` WebTransport
  upgrade. The full middleware chain still runs; `*Context.IsRaw = true` lets
  middlewares skip post-response work (timing logs, response-body measurements).
- **`Context.WriteEarly`** lets middlewares (e.g. PIN auth) short-circuit a raw
  route before the handler hijacks the connection.
- The `WebTransportUpgrader` (accessible via `HTTP3Service.Upgrader()`) wraps
  `webtransport.Server.Upgrade` so route handlers have no direct dependency on
  quic-go internals.

## HTTP/3 vs HTTP/2 — honest delta at v1 scale

At expected v1 scale (1–3 simultaneous clients per session, localhost):

- **No head-of-line blocking** benefit is measurable at 1–3 clients. TCP
  reordering is rare on localhost.
- **WebTransport** is the real win: bidi streams + unreliable datagrams over one
  QUIC connection, without a separate WebSocket upgrade or SSE polling for
  presence/typing. This is the concrete capability difference.
- **Browser compatibility**: Chrome 97+, Edge 97+, Safari 18.2+ support
  WebTransport. Firefox 114+ in experimental mode. For v1 (dev tool on macOS),
  Chromium-based browsers cover 100% of the target persona.

Choosing HTTP/3 primarily for WebTransport, not for raw throughput. If raw
throughput becomes the bottleneck at scale, the same `HTTP3Service` will benefit
— but that is not the v1 driver.

## Consequences

**Positive**:
- Single port (default `:4433`) serves REST, WebTransport bidi streams, and
  datagrams. No separate WS port to firewall or route.
- Future LAN/Tailscale exposure (Phase 8) uses the same transport; QUIC handles
  NAT traversal better than TCP for mobile clients.
- `pkg/ajan/httpclient` and `pkg/@eserstack/httpclient` are unchanged; callers
  use `WithRoundTripper(NewHTTP3RoundTripper(...))` or the browser's native
  `fetch` — both negotiate `h3` ALPN automatically.

**Negative**:
- `quic-go` is the first non-stdlib transport in `pkg/ajan/`. Sets the
  convention for future HTTP/3 services in the repo (e.g. `apps/services`).
- UDP may be blocked by restrictive corporate firewalls. Mitigation: HTTP/3
  falls back to HTTP/2 at the client side when UDP is blocked; for v1 (localhost
  dev tool) this is not a realistic concern.
- First HTTP/3 caller in the repo — `HTTP3Service` design must stay parallel to
  `HTTPService` so the appcontext composition pattern works for either.

## Related

- [ADR 0002](0002-magical-moment-and-tthw-target.md) — persona, TTHW target, and magical moment
- `pkg/ajan/httpfx/http3_service.go` — implementation
- `pkg/ajan/httpfx/router.go:RouteRaw` — raw route escape hatch
- `pkg/ajan/httpfx/context.go:WriteEarly` — middleware short-circuit for raw routes
