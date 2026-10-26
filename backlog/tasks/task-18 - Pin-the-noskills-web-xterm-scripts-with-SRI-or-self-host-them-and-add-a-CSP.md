---
id: TASK-18
title: 'Pin the noskills-web xterm scripts with SRI or self-host them, and add a CSP'
status: Done
assignee: []
created_date: '2026-09-25 00:26'
updated_date: '2026-09-25 01:12'
labels:
  - security
  - noskills-web
dependencies: []
references:
  - pkg/@eserstack/noskills-web/templates/layout.ts
  - pkg/@eserstack/noskills-web/templates/dashboard.ts
  - pkg/@eserstack/noskills-web/routes/pages.ts
  - pkg/@eserstack/noskills-web/static/client.js
  - pkg/@eserstack/noskills-web/server.ts
  - security-report.md
priority: low
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: low (likelihood low, impact high). Fingerprint: noskills-web/layout/third-party-xterm-no-sri. Full record, bounded reproduction and proposed code are in security-report.md.

The dashboard page rendered by pkg/@eserstack/noskills-web/templates/layout.ts embeds the per-process mux token in a <meta name="noskills-token"> tag and, in the same document, loads three scripts and one stylesheet from https://cdnjs.cloudflare.com by bare URL: no integrity digest, no crossorigin attribute, no nonce, and the server sets no Content-Security-Policy header or meta. The version in the URL pins a name, not content, and the browser executes whatever that host returns. Whoever controls the response for those URLs toward the operator's browser (the CDN operator, a compromise of it or of its publishing pipeline, or an on-path party able to intercept TLS to it) runs code with the page's full same-origin authority: it can read the token exactly as client.js does, open the /mux WebSocket and send writeInput frames that are keystrokes into the operator's coding-agent PTY, or POST /api/tab to spawn a new agent process as the operator. The independent sandboxed render reproduces the document structure through both layout() and the real renderDashboard() entry; the consequence chain is the first-party client's own code path and is source-established, not locally executed.

Root cause: layout.ts:23-29 builds the terminal assets as plain <link>/<script> tags pointing at cdnjs (lines 25-28) with no Subresource Integrity attribute, and nothing in noskills-web emits a Content-Security-Policy: pages.ts:32-34 sends only content-type, server.ts adds no headers and does not use the CSP middleware that exists elsewhere in the monorepo, and layout.ts has no CSP meta. The third-party content is therefore an unbound input executed inside the one page (dashboard.ts:45, served at server.ts:180 with guard.token) that carries the token.

Intended behaviour: Only reviewed, content-pinned code should execute on the origin that holds the mux token: third-party scripts and stylesheets must carry an integrity digest with crossorigin="anonymous", or be vendored under /static and served same-origin under a script-src 'self' policy, with the inline service-worker bootstrap moved to a static file or given a per-response nonce.

Trace:
1. entrypoint pkg/@eserstack/noskills-web/templates/layout.ts:26 (layout() terminalScripts): <script src="https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.js"> emitted with no integrity, crossorigin or nonce attribute (lines 27-28 do the same for the fit and web-links addons, line 25 for xterm.min.css); the browser executes whatever that host returns.
2. propagation pkg/@eserstack/noskills-web/templates/layout.ts:21 (layout() tokenMeta): The same document carries <meta name="noskills-token" content="<escaped token>">, the per-process token that gates /mux and every mutating route.
3. propagation pkg/@eserstack/noskills-web/templates/dashboard.ts:45 (renderDashboard()): The dashboard is the only render that passes includeTerminal: true together with the token; spec-detail.ts:118 calls layout() with no opts.
4. propagation pkg/@eserstack/noskills-web/routes/pages.ts:32 (handleDashboard response): The dashboard Response is sent with only a content-type header; no Content-Security-Policy restricts script or style sources, so the third-party script runs with full same-origin authority and can read the meta tag.
5. propagation pkg/@eserstack/noskills-web/static/client.js:89 (connect()): First-party code shows the exact capability any same-origin script gains: after reading the token at client.js:12-13 it opens ws://<host>/mux?token=<token>; mux-render.js:90 then sends {type:"writeInput",data} frames for every keystroke.
6. propagation pkg/@eserstack/noskills-web/server.ts:123 (route() /mux upgrade): The upgrade requires only an allowed loopback Origin (server.ts:78, auth.ts:65-91, satisfied by the page itself) and the query token (hasValidQueryToken); nothing distinguishes first-party from substituted script.
7. sink pkg/@eserstack/noskills-web/server.ts:127 (route() /mux upgrade): handleMuxWs (ws-bridge.ts:25-51) attaches the token-authenticated socket to host.server, whose writeInput actions are keystrokes into the PTY of the coding agent that mux-host.ts:98-104 spawns as the operator with the resolved agent command (default 'claude', mux-host.ts:85); POST /api/tab (api.ts:163-170) spawns a new one.

Conditions:
- third_party_dependency: The content served at cdnjs.cloudflare.com for the pinned xterm 5.3.0 URLs must be substituted toward the operator's browser: a compromise of the CDN or of its publishing pipeline, or TLS interception of that host. The repository does nothing to detect or reject a substitution; this is the attacker's precondition, not a control the repository or the CDN could enforce client-side once integrity is omitted.
- user_interaction: The operator runs `noskills web` and opens the dashboard (GET /) in a browser; the spec-detail page does not include the terminal scripts or the token.
- system_configuration: noskills-web listens on 127.0.0.1 (server.ts:214); the substituted script acts from inside the operator's browser on the dashboard origin, so loopback binding and the Origin allowlist do not apply.

Observed in the audit sandbox: Exit 0 on Node v26.7.0 (env keys: HOME, NODE_OPTIONS, NODE_VERSION, PATH, PWD, TMPDIR). dashboardViaLayout and dashboardViaRenderDashboard both report: externalScripts = [xterm.min.js, xterm-addon-fit.min.js, xterm-addon-web-links.min.js from https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/] each with integrity=null, crossorigin=null, nonce=null; externalStylesheets = [xterm.min.css] with integrity=null; cspMeta=[]; sameOriginScripts=[/static/mux-render.js, /static/client.js]; inlineScriptCount=1; tokenMetaPresent=true; tokenMetaMatchesEscapedDummy=true; tokenAppearsRawAnywhere=false. specDetailViaLayout: externalScripts=[], externalStylesheets=[], tokenMetaPresent=false.

Fix strategy: Remove the unbound third-party input from the token-bearing page. Preferred: vendor the pinned xterm 5.3.0 files (xterm.min.js, xterm-addon-web-links.min.js, xterm.min.css) under static/vendor/, drop the unused fit addon, serve them same-origin, move the inline service-worker bootstrap (layout.ts:50-63) into static/sw-register.js, and send a Content-Security-Policy on HTML responses (default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'), for example via the existing pkg/@eserstack/http/middlewares/csp.ts. Minimal alternative if the CDN is kept: add integrity="sha384-<digest>" crossorigin="anonymous" to each script and link tag, with digests computed offline from the exact 5.3.0 release files. Regression: a template test asserting every <script src> and stylesheet <link href> in layout(..., { includeTerminal: true }) is same-origin or carries an integrity attribute, and that the dashboard response carries a Content-Security-Policy header.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: Only reviewed, content-pinned code should execute on the origin that holds the mux token: third-party scripts and stylesheets must carry an integrity digest with crossorigin="anonymous", or be vendored under /static and served same-origin under a script-src 'self' policy, with the inline service-worker bootstrap moved to a static file or given a per-response nonce.
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/noskills-web/templates/layout.ts, pkg/@eserstack/noskills-web/routes/pages.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/@eserstack/noskills-web/templates/layout.ts: the xterm files now load from jsDelivr (cdn.jsdelivr.net/npm/xterm@5.3.0 and xterm-addon-web-links@0.9.0) with integrity=sha384-... and crossorigin=anonymous. The digests are SHA-384 of the npm tarball bytes; jsDelivr's files were compared byte-for-byte with the tarball before hashing, and jsDelivr sends access-control-allow-origin: *. The cdnjs URLs returned 404 for xterm 5.3.0, so the terminal was not loading before this change. The unused fit addon is dropped. The inline service-worker bootstrap moved to static/sw-register.js, so the page has no inline script. New PAGE_CSP / htmlHeaders() allow scripts only from 'self' and the pinned CDN path (no unsafe-inline or unsafe-eval), and set connect-src 'self' ws: wss:, object-src 'none', base-uri 'none', frame-ancestors 'none' and form-action 'self'. Styles keep 'unsafe-inline', because components set inline style attributes and xterm injects styles. Both HTML routes in routes/pages.ts send these headers. Chose SRI over vendoring: self-hosting would pull third-party bundles into fmt, lint and the license-header validator. Regression: templates/layout.test.ts (every external script/link has SRI and crossorigin, no cdnjs, no fit addon, no inline script, CSP present on HTML headers). It fails on the committed layout and passes now. The existing server.test.ts file-name assertion was updated to the new URLs, and all 27 noskills-web tests pass. Not verified in a real browser.
<!-- SECTION:NOTES:END -->
