---
id: TASK-11
title: >-
  Key the rate limiter on the socket peer and stop trusting forwarded headers by
  default
status: Done
assignee: []
created_date: '2026-09-25 00:26'
updated_date: '2026-09-25 01:12'
labels:
  - security
  - http
  - laroux-server
dependencies: []
references:
  - pkg/@eserstack/laroux-server/runtime/server.ts
  - pkg/@eserstack/http/middlewares/rate-limiter.ts
  - security-report.md
priority: medium
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: medium (likelihood high, impact medium). Fingerprint: http/rate-limiter/client-identity-headers-only. Full record, bounded reproduction and proposed code are in security-report.md.

The rate limiter that laroux applies to every route except /hmr derives client identity solely from the X-Forwarded-For and X-Real-IP request headers (trusted by default) and never from the accepted connection. A client that sends no forwarded header is keyed as the constant "unknown", so all direct clients of a laroux server share one 100-requests-per-60 s budget per path. One unauthenticated client that sends 101 plain requests to a path causes every other direct client to receive 429 on that path for the rest of the window, repeatable indefinitely at about two requests per second per path (other paths stay open, so the denial is per path). The same client removes the limiter from its own traffic by sending X-Forwarded-For: 127.0.0.1 or ::1 (matching the default skipIps loopback exemption) or by rotating any syntactically valid address per request, which also creates one store entry per forged value. Flipping trustProxy alone would not help: with trustProxy false every client still collapses into the single "unknown" key, because the socket peer is never an input. The laroux application cannot correct any of this: startServer never sets rateLimitConfig and ServerOptions has no field for it, so createRateLimiter({}) with all defaults runs in every `laroux serve` and `laroux dev` process, and Deno.serve is given no hostname so the server listens on all interfaces rather than the configured "localhost".

Root cause: getClientIp in pkg/@eserstack/http/middlewares/rate-limiter.ts has no socket-address input; it trusts client-supplied forwarded headers by default (trustProxy = true) and otherwise returns a single shared constant "unknown". pkg/@eserstack/laroux-server/runtime/server.ts registers the handler as (req) only, discarding the Deno.serve ServeHandlerInfo that carries remoteAddr, and builds the limiter from an empty config, so the store key is `${headerIpOrUnknown}:${pathname}` and the skipIps loopback exemption is evaluated against a requester-chosen string.

Intended behaviour: Each client's budget is accounted against an identity the client cannot choose (the socket peer, or a forwarded header only when the socket peer is an allowlisted proxy), distinct clients never share one bucket, and the loopback exemption applies only to connections that actually originate on loopback. The Go sibling pkg/ajan/httpfx/client_ip.go implements exactly this: an empty trusted-proxy allowlist trusts nobody and the socket peer is the authority. The package README also documents trustProxy as defaulting to false.

Trace:
1. entrypoint pkg/@eserstack/laroux-server/runtime/server.ts:306 (createHandler returned request handler): The handler passed to Deno.serve (line 780) is declared as (req: Request) only; the second ServeHandlerInfo argument carrying remoteAddr is never bound, so nothing downstream can see the accepted connection's address (no remoteAddr or ServeHandlerInfo reference exists anywhere in laroux-server or http).
2. propagation pkg/@eserstack/laroux-server/runtime/server.ts:303 (createHandler): createRateLimiter(deps.rateLimitConfig ?? {}) runs with {} because startServer (main.ts:434-536, initializeServer call at 525) never sets rateLimitConfig and ServerOptions (options.ts:15-47) has no such field; every default applies.
3. propagation pkg/@eserstack/laroux-server/runtime/server.ts:335 (processRequest): rateLimiter.check(req, pathname) is applied to every route before middleware, API routes, SSR page rendering and /rsc; only the /hmr WebSocket upgrade (lines 322-330) is dispatched earlier.
4. propagation pkg/@eserstack/http/middlewares/rate-limiter.ts:250 (check): clientIp = keyGenerator?.(req) ?? getClientIp(req, trustProxy); no keyGenerator is set and trustProxy defaults to true (line 92).
5. propagation pkg/@eserstack/http/middlewares/rate-limiter.ts:136 (getClientIp): The first comma-separated X-Forwarded-For entry (the hop a client supplies even when a real proxy appends its own) is returned when isValidIP passes (lines 136-141); otherwise X-Real-IP is returned under the same test (lines 146-151). The requester fully controls this value.
6. propagation pkg/@eserstack/http/middlewares/rate-limiter.ts:156 (getClientIp): With no forwarded header, an invalid header value, or trustProxy false, the function returns the constant "unknown" for every direct client.
7. propagation pkg/@eserstack/http/middlewares/rate-limiter.ts:253 (check): skipIps.includes(clientIp) exempts the request when the header-derived value is 127.0.0.1 or ::1 (DEFAULT_SKIP_IPS, line 32), so a forged X-Forwarded-For: 127.0.0.1 disables the limiter for that requester.
8. sink pkg/@eserstack/http/middlewares/rate-limiter.ts:257 (check): key = `${clientIp}:${pathname}`; all header-less clients share `unknown:<path>`, and once entry.count exceeds maxRequests (line 277) every later request on that key receives the 429 built at line 292 with Retry-After until resetTime.

Conditions:
- authentication_level: No authentication; any client that can open a TCP connection to the laroux port.
- network_routing: Shared-bucket denial affects clients whose requests reach laroux without an X-Forwarded-For or X-Real-IP header (direct clients, or a proxy that does not add one). Behind a proxy that appends X-Forwarded-For, victims are keyed by their own address but the self-exemption still holds because the first entry is client-supplied. Reachability from other hosts is the default because Deno.serve is not given a hostname and binds all interfaces.
- system_configuration: Applies to every `laroux serve` and `laroux dev` process; the application has no option to change trustProxy, skipIps or the key generator, and changing trustProxy alone would still leave one shared "unknown" bucket.

Observed in the audit sandbox: identity: no_headers="unknown", xff_loopback="127.0.0.1", xff_v6_loopback="::1", xff_client_first_then_proxy="203.0.113.9", x_real_ip="198.51.100.7", xff_garbage="unknown", trust_proxy_false_with_xff="unknown"; attacker_first_100_all_pass=true, attacker_101st=429; victim header-less first request on "/": status=429, Retry-After="60", getHeaders("unknown","/") X-RateLimit-Remaining="0"; same victim on "/other": 200 (per-path scope); spoofed_loopback_429s_in_500=0; rotating_xff_429s_in_1000=0 and store_entries_added_by_1000_distinct_xff=1000; control trustProxy=false with 101 distinct XFF values: 1 response of 429 and store size 1. Process exited 0 in under 2 s inside the sandbox; no server started, no network.

Fix strategy: Make the accepted connection the identity source. In laroux-server, bind the Deno.serve ServeHandlerInfo and pass info.remoteAddr into the limiter; also pass config.server.host as hostname so the configured bind address is honoured. In the limiter, accept a connection address, default trustProxy to false, and when trustProxy is enabled honour forwarded headers only if the socket peer is in a trustedProxies allowlist (taking the right-most untrusted hop, as pkg/ajan/httpfx/client_ip.go does). Never fold unidentified clients into one shared constant; if no address is available and no key generator is set, use a per-request key that cannot be shared (or reject). Evaluate skipIps against the socket address only. Expose the limiter configuration through ServerOptions so an application can set trusted proxies. Add regression tests: (a) two Requests with no headers and different remoteAddr never share a bucket; (b) X-Forwarded-For: 127.0.0.1 from a non-trusted peer is not exempt; (c) with trustProxy false, X-Forwarded-For does not change the key; (d) laroux passes remoteAddr into check. Fix the README default to match the code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: Each client's budget is accounted against an identity the client cannot choose (the socket peer, or a forwarded header only when the socket peer is an allowlisted proxy), distinct clients never share one bucket, and the loopback exemption applies only to connections that actually originate on loopback. The Go sibling pkg/ajan/httpfx/client_ip.go implements exactly this: an empty trusted-proxy a...
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/http/middlewares/rate-limiter.ts, pkg/@eserstack/laroux-server/runtime/server.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/@eserstack/http/middlewares/rate-limiter.ts: getClientIp(req, trustProxy = false, remote?, trustedProxies = loopback) now treats the socket peer as the authority. Forwarded headers are read only when trustProxy is on and the peer is a trusted proxy (or no peer is known, which is the caller's explicit opt-in), and the client is the right-most X-Forwarded-For hop that is not a trusted proxy. IPv4-mapped IPv6 peers are normalised. trustProxy now defaults to false (the README already documented false) and a new trustedProxies option defaults to 127.0.0.1/::1. check(req, pathname, remote?) takes the peer address; a request with no identity is no longer counted, so unidentified callers never share the old 'unknown' bucket, and skipIps is compared against the resolved identity, which a direct client can no longer choose. laroux-server's handler now takes Deno.ServeHandlerInfo and passes info.remoteAddr to check, and builds its limiter with trustProxy: true so a reverse proxy on the same host still yields per-client keys. README updated (option table, check signature, identity rules). Regression: middlewares/rate-limiter.test.ts (peer beats spoofed XFF, trusted-proxy hop selection, per-peer buckets, forged loopback XFF and rotating XFF from one peer still limited, no shared unknown bucket); it fails against the committed limiter and passes now.
<!-- SECTION:NOTES:END -->
