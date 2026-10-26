---
id: TASK-13
title: Stop sending server error stacks to clients in RSC error chunks
status: Done
assignee: []
created_date: '2026-09-25 00:26'
updated_date: '2026-09-25 01:12'
labels:
  - security
  - laroux-server
dependencies: []
references:
  - pkg/@eserstack/laroux-server/runtime/server.ts
  - pkg/@eserstack/laroux-server/adapters/react/rsc-handler.ts
  - pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts
  - pkg/@eserstack/laroux-server/adapters/react/ssr-renderer.ts
  - security-report.md
priority: medium
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: medium (likelihood medium, impact medium). Fingerprint: laroux-server/react/error-chunk-stack-to-client. Full record, bounded reproduction and proposed code are in security-report.md.

When any server component (function, async, or forwardRef) throws or rejects during render, the laroux React adapter emits an RSC 'E' chunk whose value is {message: error.message, stack: error.stack}. The chunk is streamed verbatim to the requester of GET /rsc?pathname=... (registered unconditionally in every mode, with Access-Control-Allow-Origin: *) and, under the default ssr config (mode 'always', streamMode 'streaming-optimal'), embedded in the page's <script id="__RSC_PAYLOAD__"> block. The stack discloses absolute server filesystem paths, the framework's file names and line numbers, internal call frames and the raw exception message to anyone who can make a page or /rsc request. The server's top-level catch deliberately returns a fixed 'Internal Server Error' body ('Don't expose error details to client'), and the two outer render catches send message only; the per-component chunk path bypasses all of them.

Root cause: rsc-flight-renderer.ts (lines 188-192 forwardRef, 231-235 async rejection, 249-253 sync throw) and ssr-renderer.ts (lines 331-339 forwardRef, 430-438 server component) copy error.stack into the E chunk value unconditionally. serializeChunk (protocol.ts:66-69), serializeRSCPayload/generateRSCPayloadScript (ssr-renderer.ts:737-752) and the inline embedding in createStreamingOptimalResponse (runtime/server.ts:88-108) are plain JSON.stringify with only a __rsc_pending filter; no mode, environment, redaction or generic-message substitution exists between the catch and the HTTP response.

Intended behaviour: Error detail stays in server logs (ssrLogger.error and flightLogger.error already record it); the client receives at most a message (preferably a generic one with a correlation id outside development), matching the outer catches in rsc-handler.ts:96-100 and ssr-renderer.ts:713-725 and the 'Internal Server Error' policy in runtime/server.ts:583-600.

Trace:
1. entrypoint pkg/@eserstack/laroux-server/runtime/server.ts:461 (startHTTPServer request handler, '/rsc' route): Unauthenticated GET /rsc, registered without any mode or auth gate; pathname and locale are taken from the query string (lines 465-467) and passed to getApp, which resolves the page component and dynamic params for the visitor-chosen route (main.ts:182-214, unmatched routes map to NotFound).
2. propagation pkg/@eserstack/laroux-server/runtime/server.ts:474 ('/rsc' route): renderRSCResponse(config, renderApp(Layout, Page, {pathname, params, requestContext: {cookieHeader, host, localeParam}}), bundle.moduleMap) starts the flight render with visitor-derived props.
3. propagation pkg/@eserstack/laroux-server/adapters/react/rsc-handler.ts:88 (renderRSC): renderToReadableStream(component, bundlerConfig) from rsc-flight-renderer.ts produces the wire stream; the outer catch here (92-107) only covers synchronous setup failures and emits E0 with message only.
4. propagation pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts:211 (renderElement, server component branch): The page or layout function component is executed with the visitor-derived props (const result = type(props)); a synchronous throw lands in the catch at 246, a returned promise rejection in the .catch at 230, a forwardRef render throw in the catch at 184.
5. propagation pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts:252 (renderElement catch): addChunk(context, {type: 'E', id, value: {message: error.message, stack: error.stack}}); identical construction at 234 (async rejection) and 191 (forwardRef render).
6. propagation pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts:413 (renderToReadableStream emitChunk): serializeChunk(chunk) (laroux-react/protocol.ts:66-69, plain JSON.stringify of the value) encodes the stack into the 'E<id>:{...}' line and enqueues it on the ReadableStream.
7. propagation pkg/@eserstack/laroux-server/adapters/react/ssr-renderer.ts:436 (preprocessTree catch (sibling path for page requests)): The SSR pre-pass pushes the same {message, stack: error.stack} E chunk into context.chunks (also 337 for forwardRef); createStreamingOptimalResponse (runtime/server.ts:79-108, renderSSR in streaming-classic mode then JSON.stringify of every non-__rsc_pending chunk) embeds it in the __RSC_PAYLOAD__ script block of the HTML page for the default ssr config, and the await-all path does the same thr...
8. sink pkg/@eserstack/laroux-server/adapters/react/rsc-handler.ts:118 (streamToResponse): new Response(stream, {'Content-Type': 'text/x-component', 'Access-Control-Allow-Origin': '*'}) delivers the E chunk with the full server stack to the visitor; the client (laroux-react/client.ts:991-996) restores it as error.stack.

Conditions:
- authentication_level: None. GET /rsc and page routes are served to any client that can reach the laroux HTTP server; /rsc additionally sends Access-Control-Allow-Origin: *.
- data_state: A server component (layout, page, forwardRef, or async component) must throw or reject while rendering the visitor's request. Visitor-controlled pathname, dynamic route params, cookies, host header and locale reach the component, so a route that fails on unexpected input is enough.
- system_configuration: Default laroux config (ssr.mode 'always', streaming-optimal) exposes the stack in the HTML page; /rsc exposes it in every configuration including serve mode, with no dev-only gate.

Observed in the audit sandbox: Verifier run (exit 0, Node 26, empty env, no network, target read-only). FLIGHT: wireBytes=2430, 3 E lines. E2 (sync throw): stackPresent=true, 11 lines, 'at BoomSync (file:///scratch/v21-error-chunk-check.mjs:15:29)', 'at renderElement (file:///target/pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts:211:24)'. E4 (forwardRef): stackPresent=true, 11 lines, 'at renderElement (file:///target/pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts:183:29)'. E3 (async rejection): stackPresent=true, 2 lines, harness path. SSR (streaming-classic, as createStreamingOptimalResponse calls it): html '<main></main>', 3 chunks, 1 E chunk with a 7-line stack including 'at preprocessTree (file:///target/pkg/@eserstack/laroux-server/adapters/react/ssr-renderer.ts:363:24)'; the reconstructed __RSC_PAYLOAD__ block has payloadBlockHasStackKey=true, payloadBlockHasScratchPath=true, payloadBlockHasTargetPath=true and begins '<script id="__RSC_PAYLOAD__" type="application/json">[{"type":"J","id":0,"value":"$2"},{"type":"E","id":1,"value":{"message":"v21 dummy failure: ...","stack":"Error: v21 dummy failure: ...\n    at BoomSync (file:///scratch/v21-error-c'. This independently matches the hunter's observation (agents/w2-laroux-disclosure/artifacts/rsc-error-chunk-stack-check.txt). Execution stopped at this minimum observation.

Fix strategy: Stop copying error.stack into E chunk values; keep the full error in the existing server-side logger calls. Route all five catch sites through one helper that returns a client-safe value (message only, or a generic message with a correlation id when not in dev mode). This matches the two outer catches that already send message only and requires no protocol change because stack is optional in RSCChunk. Add a regression test that renders a throwing server component and asserts the wire output and rscPayload contain no "stack" key and no file:// path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: Error detail stays in server logs (ssrLogger.error and flightLogger.error already record it); the client receives at most a message (preferably a generic one with a correlation id outside development), matching the outer catches in rsc-handler.ts:96-100 and ssr-renderer.ts:713-725 and the 'Internal Server Error' policy in runtime/server.ts:583-600.
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts, pkg/@eserstack/laroux-server/adapters/react/ssr-renderer.ts, pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.test.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
New adapters/react/error-chunk.ts exports toClientErrorValue(error), which returns { message } only. All five E-chunk sites now use it and never put error.stack on the wire: the flight renderer's forwardRef, sync and async server-component catches, and the SSR pre-pass forwardRef and server-component catches. The flight renderer now logs the full error server-side with flightLogger.error, as the SSR pre-pass already did. The client (laroux-react/client.ts) already treats stack as optional, so hydration is unchanged. Regression: adapters/react/error-chunk.test.ts renders sync, async and forwardRef components that throw an error whose stack names a server path. It asserts the flight E line keeps the message but carries no stack and no path, and that the renderSSR payload has no stack. Four of its five tests fail on the committed renderers and all pass now.
<!-- SECTION:NOTES:END -->
