---
id: TASK-20
title: Bind the posts OAuth callback to loopback and require the issued state
status: Done
assignee: []
created_date: '2026-09-25 00:26'
updated_date: '2026-09-25 01:12'
labels:
  - security
  - posts
dependencies: []
references:
  - pkg/@eserstack/posts/adapters/tui/callback-server.ts
  - pkg/@eserstack/posts/adapters/twitter/auth-provider.ts
  - pkg/@eserstack/posts/adapters/tui/menu.ts
  - security-report.md
priority: low
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: low (likelihood low, impact low). Fingerprint: posts/tui/callback-server/unauthenticated-first-request-wins. Full record, bounded reproduction and proposed code are in security-report.md.

waitForOAuthCallback in pkg/@eserstack/posts/adapters/tui/callback-server.ts is the one-shot HTTP receiver for the Twitter OAuth 2.0 PKCE browser login started from TuiMenu.browserLoginFlow (menu.ts:260-299). The Deno branch (the one `deno task tui` in deno.extra.json:4 runs through adapters/tui/app.ts:13-16) calls Deno.serve({ port, signal, onListen }) with no hostname, whose documented default in the Deno 2.9.6 declarations for ServeTcpOptions is "0.0.0.0"; the node/bun branch calls server.listen(port) with no host, which the sandbox re-check shows binding [::] (all interfaces, dual-stack). Both handlers decide acceptance solely on the presence of a `code` query parameter: request path, Host, Origin and `state` are never checked (state is read with a default of "" and passed through). The first request carrying a code receives the "Authorization successful!" page, the promise resolves with that foreign code, and the listener is closed (server.close() on node, ac.abort() in finally on Deno). TwitterAuthProvider.getAuthorizationUrl generates a random state and sends it to the authorization server but returns only { url, codeVerifier }; the AuthProvider port has no state field, and menu.ts reads only result.code from both waitForOAuthCallback and manualCodeEntry, so no comparison exists anywhere in the package (verified by grep of `state` across pkg/@eserstack/posts). Any principal that can open a TCP connection to the predictable callback port (8080 by default, 3000 in the committed sample .env) during the up-to-120 s wait can send one GET with any `code`, after which the TUI forwards that junk code with the operator's PKCE verifier to the token endpoint, the exchange fails with "Login failed", and the operator's genuine redirect arrives at a closed port (ECONNREFUSED observed). PKCE (fresh S256 verifier per attempt, sent on exchange) means a code from a different authorization request cannot be exchanged, so no token, code or verifier reaches the attacker and the login cannot be steered into another account; the demonstrated effect is termination of the operator's flow, repeatable for as long as the peer keeps sending.

Root cause: The receiver treats the presence of a `code` query parameter as proof that a request is the authorization server's redirect for this flow. It binds no listener address (unspecified address on both branches), checks no request path, no Host and, decisively, no `state`: the state is generated inside getAuthorizationUrl (auth-provider.ts:80) and placed in the authorization URL (:88) but dropped from the return value (:93-96) and absent from the AuthProvider port (application/auth-provider.ts:25), so the callback cannot be correlated with the request that was issued. The first request wins and the listener is torn down.

Intended behaviour: The receiver should bind only the loopback host named in the configured redirect URI, and should answer 400 and keep waiting for any request whose `state` does not equal the value issued for this attempt or whose path does not match the redirect path, resolving and closing only on the genuine redirect. RFC 6749 §10.12, RFC 8252 §8.10 and RFC 9700 expect a native client to bind its callback to the issued request via state; with PKCE already present, state comparison is what stops a stranger's request from ending the flow.

Trace:
1. entrypoint pkg/@eserstack/posts/adapters/tui/callback-server.ts:137 (awaitCallbackNode): server.listen(port) with no host argument: the receiver binds the unspecified address. Re-verified in the v37 sandbox run: /proc/net/tcp6 shows local=00000000000000000000000000000000:BC35 ([::]:48181) in LISTEN, reachable over 127.0.0.1 and ::1.
2. propagation pkg/@eserstack/posts/adapters/tui/callback-server.ts:65 (awaitCallbackDeno): Deno branch (the one adapters/tui/app.ts runs under `deno task tui` with --allow-net) calls Deno.serve({ port, signal: ac.signal, onListen }) with no hostname; the Deno 2.9.6 ServeTcpOptions declaration documents hostname @default "0.0.0.0". The handler at 66-81 is the same first-request-wins logic as the node branch.
3. propagation pkg/@eserstack/posts/adapters/tui/callback-server.ts:111 (awaitCallbackNode request handler): req.url is parsed against a fixed base; line 112 reads code, line 113 reads state defaulting to "". Only code === null (115) leads to a 400; path, Host, Origin and state are never compared to anything.
4. propagation pkg/@eserstack/posts/adapters/tui/callback-server.ts:121 (awaitCallbackNode request handler): On the first request with a code: timer cleared (121), 200 success page written (122-123), server.close() (124), promise resolved with the foreign code and whatever state the sender chose (125). The genuine redirect arriving later on a new connection is refused.
5. propagation pkg/@eserstack/posts/adapters/twitter/auth-provider.ts:93 (TwitterAuthProvider.getAuthorizationUrl): Returns only { url, codeVerifier }; the state generated at line 80 and placed in the URL at line 88 is discarded, so no caller can compare the callback state to the issued one.
6. propagation pkg/@eserstack/posts/adapters/tui/menu.ts:279 (TuiMenu.browserLoginFlow): code = result.code after waitForOAuthCallback(port) at 278; result.state is ignored (menu.ts:264 destructures only { url, codeVerifier }). The foreign code becomes the flow's code.
7. sink pkg/@eserstack/posts/adapters/tui/menu.ts:286 (TuiMenu.browserLoginFlow): auth.exchangeCode({ code, codeVerifier }) posts the foreign code with the operator's verifier to the token endpoint (auth-provider.ts:103-112); the exchange fails, the TUI logs "Login failed" (293-297), and the operator's real authorization code has already been lost because the listener closed on the foreign request.

Conditions:
- user_interaction: The operator must be inside the TUI browser login for Twitter (TuiMenu.browserLoginFlow), which is the only code path that starts the receiver; the CLI `eser posts login` path (login.ts:50-65) prints the URL and never listens, and the `login-callback` command it names is not registered.
- timing_dependency: The foreign request must arrive after the receiver starts and before the operator's browser completes the redirect, within the 120 s TIMEOUT_MS_DEFAULT window; a persistent sender can repeat this on every attempt.
- network_routing: The attacker must reach the port: any process or user on the same host over 127.0.0.1 or ::1 (observed); a LAN peer because the node/bun socket is bound to [::] (observed) and the Deno branch defaults to 0.0.0.0 per its declarations (not executed locally; a host firewall may block); a cross-site page in the operator's browser only where the browser's local-network access policy permits a GET to a loopback port.
- system_configuration: The port is the one in TWITTER_REDIRECT_URI: 8080 by default, 3000 in the committed sample .env, so it is predictable without reconnaissance.
- third_party_dependency: Impact stays at flow termination only because the authorization server enforces PKCE S256 on the code exchange; the client itself never rejects a foreign code and forwards it with the operator's verifier.

Observed in the audit sandbox: node v26.7.0. A: LISTEN socket /proc/net/tcp6 local=00000000000000000000000000000000:BC35 ([::]:48181). B (control, no code): HTTP/1.1 400 Bad Request "Missing authorization code"; receiver PENDING and still listening. C (foreign, wrong path, Host attacker.invalid, wrong state): HTTP/1.1 200 OK with the "Authorization successful!" HTML; waitForOAuthCallback resolved with {"code":"FOREIGN","state":"WRONG-STATE"}; LISTEN sockets afterwards: []. D (operator's genuine redirect on a new connection): ECONNREFUSED. E (second instance via ::1): HTTP/1.1 200 OK, resolved with {"code":"V6","state":"ANY"}. No provider was contacted; the exchange failure after the sink is established from source (menu.ts:286 -> auth-provider.ts:103-112 posts the junk code to the token endpoint). The Deno branch was not executed (no Deno image in the sandbox); its handler is source-identical and its bind default is taken from Deno's own declarations.

Fix strategy: Return the issued state from getAuthorizationUrl (and add it to the AuthProvider port), bind the receiver to the loopback host named in the redirect URI, and make the receiver answer 400 and keep waiting for any request whose state does not match the issued value (constant-time compare) or whose path does not match the redirect path, so only the genuine redirect can resolve or close the listener. Apply the same state comparison to the manualCodeEntry result before exchanging the code. Regression: a deno test on 127.0.0.1 with a free port that (a) asserts the bound hostname from onListen is 127.0.0.1, (b) sends GET /callback?code=x&state=wrong and asserts 400 with the promise still pending, then (c) sends the right state and asserts it resolves with that code; and the same three assertions on the node branch via node --experimental-strip-types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: The receiver should bind only the loopback host named in the configured redirect URI, and should answer 400 and keep waiting for any request whose `state` does not equal the value issued for this attempt or whose path does not match the redirect path, resolving and closing only on the genuine redirect. RFC 6749 §10.12, RFC 8252 §8.10 and RFC 9700 expect a native client to bind its callback to t...
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/posts/application/auth-provider.ts, pkg/@eserstack/posts/adapters/twitter/auth-provider.ts, pkg/@eserstack/posts/adapters/tui/callback-server.ts, pkg/@eserstack/posts/adapters/tui/menu.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The issued state now flows end to end. New AuthorizationRequest type { url, codeVerifier, state } in application/auth-provider.ts. TwitterAuthProvider.getAuthorizationUrl returns the state it sends; the Bluesky stub and the test double follow the new type. adapters/tui/callback-server.ts: waitForOAuthCallback takes a CallbackExpectation built by expectationFor(redirectUri, state), which accepts only loopback redirect hosts (localhost maps to 127.0.0.1) and rejects 0.0.0.0 and remote hosts. Both runtime branches bind that loopback host (Deno.serve hostname; Node server.listen(port, host)). A request resolves the login only via matchCallback: the redirect path must match and the state must equal the issued one (constant-time compare). Anything else, and any request after the first match, gets 400 and is ignored, so a foreign request no longer ends the flow. The Deno branch now starts its timeout only after a successful bind and always clears it; the Node branch calls closeAllConnections after resolving. menu.ts passes the expectation and, on the manual-paste fallback, refuses a URL whose state differs. Regression: adapters/tui/callback-server.test.ts (loopback-only expectation, path/state matching, a real receiver answering three foreign requests with 400 and then accepting the genuine redirect, and no listener on a non-loopback interface). It fails on the committed server, and all 24 posts test files pass. The CLI login path (login.ts) prints the URL and starts no listener; it now also receives state but does not use it.
<!-- SECTION:NOTES:END -->
