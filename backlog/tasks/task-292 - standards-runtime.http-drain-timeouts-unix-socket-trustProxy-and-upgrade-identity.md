---
id: TASK-292
title: 'standards: runtime.http drain, timeouts, unix socket, trustProxy and upgrade identity'
status: Done
assignee: []
created_date: '2026-10-24 01:30'
updated_date: '2026-11-07 16:47'
labels:
  - standards
  - http
  - track-l
milestone: m-7
dependencies:
  - TASK-180
  - TASK-241
priority: medium
ordinal: 292000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-2's runtime.http section beyond TASK-180's peer address: graceful drain with a timeout (close, closeIdleConnections, then closeAllConnections), headers, request and keep-alive timeouts, an optional unix socket, opt-in trustProxy for request.url and the peer address, and the documented upgrade identity rule (the upgrade Response is returned as the same object, node-http.ts:494). laroux-server's runtime and dev server both use it (doc-3 section 3.2). S9's result (L-S4) decides whether anything else is needed.

Plan key: L3. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tests cover drain with an in-flight request, each timeout, a unix socket listener and trustProxy on and off
- [x] #2 A test upgrades a WebSocket through a wrapper that returns the same Response object
- [x] #3 The standards README documents the options, and the gate passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-07. Node adapter only (cross-runtime/adapters/node-http.ts, new adapters/trust-proxy.ts, types.ts).

Drain: an abort stops listening, closes idle connections and sends WebSockets a 1001 close frame at once, then waits up to shutdownTimeoutMs (default 10000, the value doc-2 gives the dev worker's drainTimeoutMs; doc-2 names none here) and closes what is left, WebSockets included. Node keeps a connection open after a response, so each response that finishes during a drain closes idle connections again, and a response that starts during one carries `connection: close`. A handler that returns after its connection went away has its body cancelled; before, such a stream was never cancelled and writeResponse could wait forever on a drain event.

Timeouts: headersTimeoutMs, requestTimeoutMs and keepAliveTimeoutMs go to http.createServer and keep Node's defaults when left out. Node only checks the first two on connectionsCheckingInterval (30 s by default), so a shorter timeout also shortens the interval to half its value, at least 50 ms; otherwise a 1 s limit could fire up to 30 s late. serve rejects a timeout that is not a whole number, 0 or more.

Unix socket: unixSocket replaces hostname and port. HttpServer and onListen use the new ListenAddr, which adds unixSocket (string or null) to NetAddr; on a socket hostname is "" and port is 0. A path in use rejects with EADDRINUSE and the file is not removed, since it may belong to a running server.

trustProxy: off by default, and no forwarded header is read unless the socket peer is listed. Entries are IP addresses, CIDRs and "unix:" for a unix socket peer, matched with net.BlockList; an invalid entry rejects serve. X-Forwarded-For sets info.remoteAddr to the right-most address that is not a listed proxy, with port 0; X-Forwarded-Proto and X-Forwarded-Host set the scheme and host of request.url, the last value of a list counting, and an invalid value is ignored. The Forwarded header (RFC 7239) is not read. doc-2 types remoteAddr as a string; TASK-180's NetAddr object stays.

info.signal: doc-2's handler info includes it, so ServeHandlerInfo gains a required signal. It aborts when the connection goes away before the response finished, and for a handshake when the connection closes. request.signal follows it on upgrades too, where it was null before. The required field needed one fixture line in laroux-server/runtime/server.test.ts, the only change outside standards.

Upgrade identity: the behavior was already there. It is now documented on WebSocketUpgrade.response, upgradeWebSocket and in the README, and tested in both directions.

Migration: no line added. shutdown behavior did change (an abort used to close in-flight requests at once), but runtime.http does not exist in 4.5.2 (no RuntimeHttp, ServeOptions or upgradeWebSocket in its types.ts), so no released default changes. The timeouts keep Node's defaults and trustProxy is off.

Open: the S9 check in TASK-285 (L-S4) has not run, so whether anything more is needed here is still undecided. It compares this adapter with srvx 1.0.5 on performance and decides whether laroux-server keeps it, which nothing in this task depended on. laroux-server's startHTTPServer passes none of the new options yet, so it gets the default drain only; its config has no trustProxy, unixSocket or timeout settings. doc-3 section 3.2 needs that wiring in a laroux task.

Verified: `pnpm ok` passed (formatter, linter, type-check, tests, Go). Tests use ephemeral ports and temp sockets under etc/temp and wait on events; the only time bound is a 4 s race against the 5 s WebSocket close wait. node-http.test.ts ran three times in a row with no failure, and no test process or socket directory was left behind. Mutating node-http.ts failed the matching tests for: no idle close after a response, a synchronous forced close at stop, no forced close at the deadline (the suite hangs and had to be killed), no WebSocket destroy, reading headers with trustProxy off, no body cancel, accepting a copied Response, no shorter checking interval and no `connection: close`. Not run on Windows, where the unix socket suite is skipped.
<!-- SECTION:NOTES:END -->
