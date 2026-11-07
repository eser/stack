---
id: TASK-377
title: 'standards: runtime.http keep the request host for a double-slash path'
status: Done
assignee: []
created_date: '2026-11-07 19:54'
labels:
  - standards
  - security
  - bug
milestone: m-7
dependencies: []
priority: high
ordinal: 380000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-292. The Node adapter of runtime.http resolves the raw request target against a base URL, so `GET //evil.com/x` and `GET ///evil.com/x` reach the handler as `http://evil.com/x`: the client picks the host of `request.url`, and the handler sees the path `/x` instead of the one sent. A browser sends such a target for a link to `http://site//evil.com/x`, with the site's own Host header.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The handler sees the server's host for both double-slash and triple-slash targets, tested through a live server
- [x] #2 Normal paths and `/a//b` are unchanged, tested
- [x] #3 `pnpm ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: pkg/@eserstack/standards/cross-runtime/adapters/node-http.ts:151-154 at 4665f99e, `new URL(incoming.url ?? "/", `http://${host}`)`. The second argument is a base for a relative reference, and a target starting with `//` is a scheme-relative reference that names its own host. A target is a path, not a reference. `/\evil.com/x` took the host the same way, because a backslash reads as a slash in an http URL; a live probe showed that too, so it is covered. `\\evil.com/x`, a raw tab and `evil.com/x` never reach the adapter: Node answers 400.

Fix: the new `toRequestUrl` in node-http.ts. A target starting with `/` is parsed on a placeholder host, and only its path, query and fragment are set on the URL built from the Host header. Handshakes share `toRequest`, so they get the fix too. Setting the parts, rather than joining strings, keeps how a Host is treated: `Host: h/foo` and `Host: h?q` still give host `h` with the target's path, and `Host: a@b` still answers 400.

Absolute form (`GET http://evil.com/x HTTP/1.1`): unchanged, and it keeps the target's host and ignores the Host header, because RFC 9112 (3.2.2) requires that of an origin server. It gives a client nothing it lacks: the same client can send `Host: evil.com`, and a browser cannot send this form to an origin server. A proxy that validates Host and forwards the target raw would be a concern for that deployment, and a trusted X-Forwarded-Host still replaces the host (TASK-292). Credentials in the target answer 400, because `new Request` refuses them. Tests pin these. Left open: a live probe shows `GET https://evil.com/x` gives an https `request.url` on a plain connection, and `GET ftp://evil.com/x` gives an ftp one. The https case is what the RFC describes; the ftp case could answer 400, but this task did not ask for that and no test pins it.

What handlers see now: a pathname can start with `//`, where the parser used to drop that part. The README says not to pass one to `new URL(pathname, base)` or a Location header unchecked. Other code that uses a pathname is listed below.

Search of the repository for a URL built from a raw target, and for code that the new pathname reaches. TypeScript by grep over pkg and cmd for `new URL(` with a request URL, target or pathname, and for Location and redirect values built from a pathname; Go by grep for RequestURI. Found by pattern, so a differently written case could be missed:

- standards: `toRequest` was the only one. shared.ts:475, server-websocket.ts:389 and the test scenario parse the absolute `request.url`, which is safe. Nothing else to fix there.
- pkg/@eserstack/laroux-server/runtime/server.ts:463, not fixed (outside standards) and needs its own task: `new URL(rscPagePathname, url.origin)`, where :453 takes the value from the query of `GET /rsc?pathname=`. Running those two statements with `//evil.com/x` gives `http://evil.com/x`, so the request handed to the proxy chain carries another host. It does not depend on the adapter, so this fix does not reach it. Not run through a live laroux server.
- pkg/@eserstack/laroux-server/runtime/action-guard.ts:99 and http/middlewares/csrf.ts, which parse `req.url`: action-guard compares the Origin header with the origin of `request.url` when no Sec-Fetch-Site is sent. Before this fix, by reading the code, a cross-site page at `http://evil.com` posting to `http://site//evil.com/x` would have matched. This fix closes that, since the origin is now the site's. Not exercised with a test.
- laroux-server static serving (server.ts:243, :308): `pathContainment.resolveWithin` returned null for `/etc/passwd` and `//etc/passwd` when run directly, so a `//` path answers 403 rather than leaving the directory.
- pkg/@eserstack/ajan/wasm/profile-parity-server.worker.ts:50, test helper, not fixed: the same pattern, but it reads only `.pathname` and its clients are tests. pkg/@eserstack/ajan/wasm/node-reactor-http.test.ts joins the strings, which cannot change the host.
- Go: no use of RequestURI outside tests in cmd, pkg/ajan or pkg/@eserstack/ajan.

Verified: the live-server tests in node-http.test.ts send raw requests over a socket. Before the fix 13 of the 29 failed, including every double-slash, triple-slash and backslash host case, and the 16 that passed were the behavior meant to stay. After it all 29 pass. They cover double and triple slashes, a query, a Host port, HTTP/1.0 without a Host (the server's own address), trustProxy, a WebSocket handshake, normal paths, `/a//b`, absolute form and credentials. `pnpm ok` passed.

No CHANGELOG entry: a fix that needs nothing from a user, and runtime.http is not in 4.5.2.
<!-- SECTION:NOTES:END -->
