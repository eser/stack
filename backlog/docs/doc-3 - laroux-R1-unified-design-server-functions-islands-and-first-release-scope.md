---
id: doc-3
title: 'laroux R1: unified design for server functions, islands and the first-release scope'
type: specification
created_date: '2026-10-24 01:00'
---

# laroux R1: React server functions, islands and server islands on Flight, with prerendering, sessions, i18n routing and composable fetch handlers, on Node and Cloudflare Workers

Status: design for track L. It merges the two designs from the 2026-10-23 design run (etc/temp/plan/laroux-actions-islands.json: `actions`, `islands` and the `completeness` critique) into one, resolves the 19 inconsistencies between them, covers the 19 gaps the critique found, and adds the first-release scope of decision-54. Track L tasks (TASK-280 to TASK-318) point to sections of this document.

How to read it:
- Owner decisions override everything here: decision-46 to decision-54 and decision-57 to decision-60 for laroux, decision-45 and decision-55 for the ajan bridge.
- Choices marked **(planner default)** follow the critique's recommendation or the design run's own. The owner did not object to them on 2026-10-23, and may still override any of them. Section 25 records the owner's answers to the five that were put to them on 2026-10-24.
- doc-2 stays the reference for the bundler host, the dev worker and the request pipeline. Where doc-2 and this document disagree, this document wins. Everything in doc-2 about laroux-start, start-plugin-core, createServerFn, srvx, the vendored Flight runtime, the lockfile gate and the compat ledger no longer applies (decision-48, decision-53).
- Facts marked "verified" were checked in the design run against tarballs or docs. Everything else is design intent until a spike confirms it.

## 1. Scope

R1, the first track L release:
- React server functions on React's Flight runtime: module-level and inline "use server", form actions, useActionState with permalink, useFormStatus, useOptimistic, temporary references and no-JS progressive enhancement (section 7).
- Optional helpers over plain server functions: defineAction (with state mode), defineQuery, shared middleware, typed errors, bindSealed, getActionResult, actionUrl (section 7).
- React-only islands in one React root: `<Island when>` with load, idle, visible, media, interaction, signal, only, never, any and custom strategies, code deferral, zero-JS pages (section 8).
- Server islands: `<Defer>` in stream mode and in cacheable fetch mode (section 9, decision-54).
- Static prerendering and partial prerendering (section 10, decision-54).
- A cache API with Next-compatible names and a CacheProvider port (section 11).
- Built-in sessions with drivers for Node and Workers (section 12, decision-54).
- i18n routing (section 13, decision-54).
- A typed env split that never inlines server-only values into client chunks (section 14, decision-54).
- One `onRequestError` hook (section 15, decision-54).
- Composable fetch handlers (section 16, decision-54).
- A per-request CSP nonce, and hashes for prerendered pages (section 17).
- HMR and Fast Refresh from day one (section 18, decision-51).
- Node and Cloudflare Workers deploy targets (section 19, decision-52).

Phase 2, after R1:
- The module-level `export const hydration` default, applied at call sites.
- The script-free HTML mode for `<Defer>`, so a page whose only dynamic part is a server island ships no React.
- A CdnPurger adapter for the Cloudflare purge API, and ISR.
- Activity keep-alive, `<ViewTransition>`, segment-level router diffing and the `static` never() mode (S-I11).
- Children and slots for `<Defer>` targets.
- JSON-Schema-driven FormData coercion, idempotency storage, offline retry, a tracer port, client-side per-function middleware.

Separate designs, not part of R1: a `"use cache"` directive and data cache, KV- or Durable-Object-backed tag versioning, content collections, image and font pipelines beyond doc-2's bundler plugins.

## 2. Packages and subpaths

decision-46 fixes three packages. This section amends its subpath list (planner default; it needs a decision-46 amendment, TASK-289).

**@eserstack/laroux** (what app code imports, decision-47). Peers: `react` and `react-dom` on the same minor. react-dom becomes a peer because /client needs react-dom/client and /ssr needs react-dom/server, which throws under the react-server condition. Dependencies: `react-server-dom-webpack` (~19.3.1) and `@vitejs/plugin-rsc` (~0.5.38) for its /transforms only (decision-48; S1 checks both, and vendoring stays the fallback). Both are the newest stable releases on 2026-10-24; decision-59 keeps the ranges on the newest React minor that passes the contract suite.

App-facing subpaths:

| Subpath | Condition | Holds |
| --- | --- | --- |
| `/config` | none | defineConfig and the config types |
| `/rsc/server` | react-server only | request APIs (getRequest, headers, cookies, locals, clientAddress, preferredLocales, cspNonce, setStatus, responseHeaders), control signals (redirect, permanentRedirect, notFound, forbidden, unauthorized), cache calls (refresh, revalidatePath, revalidateTag, updateTag, cached), `after`, `session`, `locale` and the i18n helpers, `Defer`, `islandContext`, `bindSealed`, `getActionResult`, `callAction`, `getActionContext`, the env server reader, and the re-exported React taint APIs |
| `/actions` | none (isomorphic) | defineAction, defineQuery, defineMiddleware, ActionError, isActionError, isInputError, safe, withOptions, initialActionState, actionUrl, formDataToObject |
| `/islands` | none | strategy constructors and types, StrategyHandler, the island props codec |
| `/client` | client-safe | Island, ClientOnly, Form (GET navigation), Link, the router and its hooks, useIslandState, hydrateIsland, openIslandSignal, prefetchIsland, useLocale, the env client reader |
| `/server` | react-server only | composable fetch handlers (section 16) |
| `/guard` | none | guardActionRequest and its policy types; the host also calls it |

Framework-internal subpaths (imported by generated entries, never documented for apps): `/rsc` (reference table, dispatch, envelope, seal and keyring, request store, HostContext and port types), `/rsc/transforms` (pure transforms over plugin-rsc's), `/ssr` (Flight injection, zero-JS buffering, nonce threading, bot rendering, the partial-prerender stitcher), `/browser` (callServer, the call queue, tree commit, skew handling) and `/rsc/testing`.

Build errors: importing `/rsc/server`, `/server` or `/rsc` from a client graph, and importing `/ssr` or `/browser` from app code.

**@eserstack/laroux-server** (npm `laroux`, bin `laroux`): `cli/`, `dev/`, `adapters/native` (route scan, virtual modules, rsc-plugin wiring, route-binding map, prerender step, build checks, entry templates) and `runtime/` (the fetch host bundled into dist/server, static and prerendered file serving, CacheProvider and session driver implementations, keyring loading and startup checks). It owns the FrameworkAdapter port. `adapters/start` is gone (decision-53).

**@eserstack/bundler**: React-free and laroux-free. Environments, AppBuilder, EnvironmentManifest, define and inject, CSS, assets, env, fonts and images plugins, build cache. Its module map gains opaque alias entries `{ id: "<ref>~d", target: "<ref>" }` that resolve to the same module and chunks; the bundler knows nothing about holding them (section 8).

Boundary validator (TASK-314): laroux-server/runtime/ never imports cli/ or dev/; bundler never imports react or a laroux package; @eserstack/laroux never imports @eserstack/bundler or laroux-server; nothing imports @tanstack/*.

laroux-react and laroux-bundler are removed by decision-46. Their removal is additive in 5.x: the new subpaths ship beside the old pipeline, the old packages are deprecated, and they are deleted in 6.0.0, the major right after the R1 minor, so the deprecation lasts one 5.x minor (decision-58; TASK-317).

## 3. Request lifecycle and the host port

### 3.1 Host context

One port type in `/rsc` (resolves inconsistencies 6 and 7):

```ts
interface HostContext {
  env: Record<string, string | undefined>;   // process.env on Node, the Worker env binding on Workers
  bindings: Record<string, unknown>;          // Workers bindings (KV namespaces and others); empty on Node
  remoteAddr: string;
  signal: AbortSignal;
  waitUntil(promise: Promise<unknown>): void;
  keyring: Keyring;
  cache: CacheProvider;
  sessions: SessionDriver | undefined;
  rateLimit: RateLimiter;
  buildId: string;
}
```

The generated rsc entry exports `handle(request, hostCtx)` and `resolveBodyCap(request)`. The generated ssr entry exports `render(flightStream, renderCtx)`. laroux-server/runtime builds the HostContext once per request and never imports React.

Request store: one AsyncLocalStorage per environment bundle, registered under `globalThis[Symbol.for("laroux.requestStore:" + env)]`, with env `rsc` or `ssr`. A second registration in the same environment throws at startup, which catches a doubled install, while the rsc and ssr bundles can share one process or isolate. Workers needs nodejs_compat for AsyncLocalStorage (SA5 checks it across Flight streaming; the fallback is an explicit context argument on Workers, recorded as a parity break).

### 3.2 Order of a request

Host (laroux-server/runtime), before any app code:
1. `/_laroux/health`.
2. Rate limit on the peer address (forwarded headers only from trustProxy peers).
3. Static dist/client, `_prev/<buildId>/` from `--keep-assets`, and prerendered `index.html` and `_.rsc` files. The static layer never serves a path containing `/_.query/`, `/_.island/` or `/_laroux/`, and never answers a request that carries `x-rsc-action` (resolves gap 4).
4. Body cap from `resolveBodyCap` (per-action cap from the id when the action declares one, otherwise the global cap; no-JS page posts always get the global cap), enforced while streaming, plus the `bodyReadMs` read deadline.
5. The app's fetch handler, which is the composed handler of section 16.

App handler, default composition (section 16 shows how to change it):
1. i18n: locale detection, prefix stripping and redirects (section 13).
2. Sessions: lazy session context (section 12).
3. Route match against `virtual:laroux/routes`, after stripping the `/_.rsc`, `/_.query/<id>` or `/_.island/<id>` suffix.
4. The proxy.ts chain of the matched path (root first, then each segment).
5. Endpoint dispatch, each with its guard inside dispatch so composition order cannot skip it:
   - action calls (section 7.4)
   - queries (section 7.5)
   - server islands (section 9)
   - route.ts handlers
   - Flight navigation `GET <path>/_.rsc`
   - documents, including no-JS page POSTs
6. `after()` callbacks through waitUntil.
7. Errors go to onRequestError (section 15).

## 4. Endpoints and the wire

### 4.1 URL table

| Request | URL | Notes |
| --- | --- | --- |
| Document | `GET <path>` | HTML with inline Flight; bots get a full render (4.5) |
| No-JS form | `POST <path>` | multipart with React's `$ACTION_ID_`, `$ACTION_REF_` and `$ACTION_KEY` fields |
| Flight navigation | `GET <path>/_.rsc` | `Cache-Control: private, no-cache` unless prerendered |
| JS action call | `POST <path>/_.rsc` + `x-rsc-action: <id>` | posted to the current page path (7.4) |
| Query | `GET <path>/_.query/<id>?a=<reply>` | POST when the reply exceeds 8 KiB, never cached then (7.5) |
| JSON action | `POST /_laroux/a/<id>` | only for actions with `accept: "json"` |
| Server island | `GET <segment path>/_.island/<id>?t=<token>` | POST with a JSON body above 2048 URL characters, never cached then (9) |

A segment that has both a page and a route.ts is a build error, so a POST to a page URL is never ambiguous (doc-2).

### 4.2 Action response envelope

One versioned envelope (resolves inconsistency 8), carried inside the Flight body:

```ts
type ActionEnvelope<T> =
  | { v: 1; ok: true; data: T; tree?: FlightRoot; redirect?: string; invalidate?: { tags: string[]; paths: string[] } }
  | { v: 1; ok: false; error: SerializedActionError; tree?: FlightRoot; redirect?: string; invalidate?: { tags: string[]; paths: string[] } };
```

- `tree` is present for serial actions after refresh(), revalidatePath, revalidateTag, updateTag, a cookie or session change, or an in-process redirect. Parallel actions never get it.
- `invalidate` lists the tags and paths the action invalidated. The client refetches mounted fetch-mode islands whose tags intersect and evicts matching prefetched `_.rsc` payloads (resolves gap 5). Any response with `tree` clears the whole prefetch cache.
- The no-JS path renders HTML with `formState`, and fills getActionResult (7.3).
- doc-2's `{ returnValue, root, formState }` and the islands design's `x-laroux-refresh` header are dropped.

Headers on action responses: `x-laroux-build`, `x-laroux-action: ok | error | redirect | raw`.

### 4.3 Header policy for every Flight response

`_.rsc`, `_.query`, `_.island` and action responses all send (resolves gap 19):
- `content-type: text/x-component`
- `x-content-type-options: nosniff`
- `x-robots-tag: noindex`
- `content-security-policy: default-src 'none'; frame-ancestors 'none'; sandbox`
- `x-laroux-build: <buildId>`
- Cache-Control by kind: `private, no-store` for actions; `private, no-cache` for dynamic `_.rsc`; the declared scope for queries and islands; `public, max-age=0, must-revalidate` for prerendered `_.rsc` files.

No response ever carries `Vary: *`.

### 4.4 Version skew

- Ids are stable across builds by default (section 6.1), and `--keep-assets <n>` keeps earlier hashed client files under `dist/client/_prev/<buildId>/`.
- Pre-dispatch statuses map to typed client codes: 400 BAD_REQUEST, 403 FORBIDDEN, 404 NOT_FOUND, 409 ACTION_UNAVAILABLE (with `x-laroux-action-unknown: 1`), 413 CONTENT_TOO_LARGE, 415 UNSUPPORTED_MEDIA_TYPE, 429 TOO_MANY_REQUESTS.
- One client skew policy for actions and islands (resolves inconsistency 16): a one-shot reload guard in sessionStorage keyed by the server build id. It covers a 409 for an unknown action id, a 409 for an unknown island codec or key id, a 200 whose `x-laroux-build` differs (the client delivers `data`, drops a `tree` that names chunks of another build, then reloads after the transition), and a failed chunk import. After one reload with no change, the client surfaces ACTION_UNAVAILABLE or the island error and does not reload again, so a CDN-cached old shell cannot loop.

### 4.5 Bots

Crawler user agents (a built-in list, overridable in config) get an onAllReady render. On dynamic routes, `<Defer mode="auto">` resolves to `stream` for bots, so server-island content is in the HTML (resolves gap 6). Prerendered routes keep fetch mode with the `noscript` link, documented as an SEO caveat. **(planner default)**

### 4.6 Internal fetch headers

`client.fetchHeaders` in laroux.config names a "use client" module whose default export returns extra headers for every framework fetch: action calls, `_.rsc` navigations and prefetches, `_.query` and `_.island` requests. It serves preview protection and skew pinning behind Cloudflare Access or similar proxies (resolves gap 15).

## 5. The guard

`guardActionRequest(request, policy, kind)` in `/guard`, called inside dispatch. Kinds and rules (resolves inconsistency 14 and gap 17):

| Kind | Rules |
| --- | --- |
| `rsc` (JS action call), `query` POST, `json`, `island` POST | Reject `Sec-Fetch-Mode: navigate`. Sec-Fetch-Site `same-origin` or `none` passes; `same-site` only by opt-in; anything else fails. `Origin: null` fails. Otherwise Origin must equal `canonicalOrigin` or an `allowedOrigins` entry, compared as the full scheme, host and port; forwarded host and proto count only with `trustProxy`. A request with neither header fails unless the action opts in with `headerless: "allow"` (decision-60). `rsc` needs `x-rsc-action` and a text/plain or multipart body; `json` needs application/json; urlencoded gets 415. |
| `form-page` (no-JS POST to a page) | multipart; Sec-Fetch-Site same-origin, or an Origin equal to the canonical origin when Fetch Metadata is absent; Sec-Fetch-Mode navigate; Sec-Fetch-Dest `document`, or `iframe` / `frame` for forms in embeds, which the default `frame-ancestors 'self'` already limits to same-origin frames. Everything else gets 403. SA14 checks these values in Chromium, Firefox and WebKit before the table is final. |
| `query` GET, `island` GET | 404 for `Sec-Fetch-Mode: navigate` or `Sec-Fetch-Dest: document`. Headerless requests are allowed, because the endpoints are side-effect free (cookie and session writes throw there) and CDNs revalidate without headers. |

`allowedOrigins` names reverse-proxy origins only. It is not CORS; laroux answers no preflight, and `x-rsc-action` forces one for cross-origin fetches.

Headerless requests (decision-60). An unsafe request with neither Origin nor Fetch Metadata gets 403 FORBIDDEN unless its action sets `headerless: "allow"`. In dev each rejection logs one line naming the action, the missing headers and the opt-in. The laroux README documents this where developers will hit it: which endpoints reject these requests, the response and its code, the CSRF reason, how curl, scripts and server-to-server callers send an Origin header, and what the opt-in costs. createTestRequest and callAction in /rsc/testing send same-origin headers by default.

## 6. Ids, keys and sealing

### 6.1 Ids

One id policy for action ids and island ids (resolves inconsistencies 5 and 18):
- `id = base64url(flags(1 byte) || SHA-256("laroux/<kind>/v1\0" + salt + "\0" + rootRelativePath + "\0" + exportName)[0..15])`, 22 characters, no `#`.
- `kind` is `action` or `island`. The salt is `ids.salt` from config, or the `LAROUX_ID_SALT` env var at build time, or the package.json name. It is not a secret.
- Every id that appears in a client artifact is a public endpoint (the CVE-2026-64643 class, verified); authorization belongs inside the handler or the island. Teams that want ids hidden from someone with the source set a private salt.
- Flags byte for action ids: kind (action or query), parallel, sealedBound, state, prevState-opaque, json-accept, one reserved bit. Island ids use flags 0.
- Inline action ids use the export name `$$inline:<enclosing export>:<function name>`, and only anonymous inline functions use an ordinal (dev warns that those shift on reorder).
- Dev and production use the same hashed ids. The dev overlay and dev logs map ids to `file#export` from a dev-only manifest.

### 6.2 Keyring

One runtime keyring (resolves inconsistency 4):
- `LAROUX_KEYS="kid1:base64key,kid2:base64key"`. The first key is active; the others still verify and unseal. `LAROUX_SECRET=<base64>` is a one-key shorthand. `LAROUX_ACTIONS_SECRET`, `LAROUX_ACTIONS_KEYS` and `LAROUX_SECRET_PREVIOUS` are dropped.
- Subkeys: HKDF-SHA256 per kid with info `laroux/<purpose>/v1`. Purposes: `bound` (sealed action arguments), `flash` (PRG flash cookies), `island-sign`, `island-seal`, `session` (the sealed-cookie session driver).
- Read at run time from process.env on Node and from the Worker env on Workers, cached per process or isolate, never inlined into output. Next embeds its key in the build (verified); laroux does not.
- The keyring is also needed at build time whenever prerendering emits seals or island tokens (resolves gap 3). The build writes `dist/server/laroux-build-keys.json` with every kid it used, and runtime startup (first request on Workers) fails when the keyring lacks one of them.
- Production fails at startup when the build uses sealing, fetch-mode Defers or the sealed-cookie session driver and no keyring is present. A per-isolate random key would break seals across Workers isolates, so there is no fallback.
- Dev keys live in `.laroux/dev-keys`, persist across rebuilds, and are refused outside dev.
- Rotation order, documented: deploy with the new key added second, rebuild, promote it to first, and retire the old kid only after every prerendered page built with it is gone.

### 6.3 Sealing

- AES-256-GCM with a 12-byte random IV for `bound`, `flash`, `island-seal` and `session`; AAD binds purpose, id and kid. HMAC-SHA-256 for `island-sign`. All WebCrypto.
- laroux never overrides `.bind`: rsdw 19.3.1's reply decoder calls fn.bind with client-supplied bound arguments (server.node.production.js lines 2810 and 3761, verified). Seals come only from compiled inline use sites (`$$hoist.bind(null, $$laroux_seal(...))`) and from `bindSealed(fn, ...values)`, and unsealing happens inside the handler wrapper, so a forged plaintext argument fails with 400 before user code runs, on the RPC, `$h`-in-arguments and `$ACTION_REF_` paths alike.
- Expiry: dynamic renders carry `exp = render time + sealed.dynamicTtl` (default 30 days). Cacheable output carries no expiry (6.4).

### 6.4 Cacheable output

One definition (resolves gap 2 and inconsistency 17). Cacheable output is any of: a `prerender: true` page, the prelude of a `prerender: "partial"` page, a public-scope Defer fragment, and a public-scope defineQuery response. In cacheable output:
- seals carry no expiry, or an expiry of at least maxAge plus swr when the output has a cache lifetime;
- `bindToSession`, cookie-derived captures and session reads are a build error where the output is built statically, and a runtime throw in public scope;
- `cookies()`, `headers()`, `session()` and undeclared search params throw.

## 7. Server functions

The actions design (etc/temp/plan/laroux-actions-islands.json, `actions.api`) is the API reference. This section records the merged rules.

### 7.1 Plain "use server"

React's contract exactly: module-level async exports and inline closures, `form action` and `formAction`, useActionState with permalink, useFormStatus, useOptimistic, temporary references, decodeAction and decodeFormState for no-JS forms. Build errors: an export that is provably not a function, `export *`, inline "use server" in a "use client" file, a server-only module reached from a client graph, and a non-literal value for a client-visible option. A runtime check at module load asserts that every registered export is a function.

### 7.2 Helpers

`defineAction`, `defineAction({ state: true })` and `defineQuery` each return an ordinary server function. Options: `input`, `output`, `errors`, `use`, `limits`, `timeoutMs`, `concurrency: "serial" | "parallel"`, `bound`, `accept: "json"`, `headerless`, `allowDocumentResponse`, `noJs: "render" | "prg"`, `echo`, `usesPrevState`. Standard Schema v1 or a function validates input and output. Expected ActionErrors and input errors become returned state in state mode; unexpected errors throw.

### 7.3 No-JS results

`getActionResult(fn)` in a server component returns `{ data } | { error } | undefined` for the current no-JS post, and survives `noJs: "prg"` through a sealed flash cookie of at most 2 KB (render mode above the cap, logged once in dev).

### 7.4 Calls and route binding

- callServer posts to `<current path>/_.rsc` (resolves gap 8). It never retargets the post path, because the refreshed tree must match the current page.
- Route binding: the build records which route segments' module graphs reach each action, and one binding manifest covers actions and Defer targets (resolves inconsistency 15). A POST outside an action's binding gets 404, so the proxy.ts chain of the request path is always one that owns the action. The JSON endpoint runs the proxy chains of every bound segment.
- The build warns when a client module that imports an action is reachable from a layout above the action's binding, and suggests moving the action to a shared module.
- If SA13 shows that per-route reachability is imprecise (shared chunks, dynamic imports), binding falls back to root-bound for the affected actions, and the proxy-coverage parity row drops from better to equal.
- Calls in flight during a navigation keep their original path; the client queue releases the slot when the root model resolves, and a tree for the old path is dropped if the navigation committed first.
- Client queue: serial by default, Next-style, with navigation preempting. `parallel` (a literal, read from the id's flags byte) skips the queue and can never return a tree: refresh, revalidate*, updateTag, redirect or a cookie or session change inside it throws in dev and becomes `invalidate` in production.

### 7.5 Queries

- `defineQuery({ cache: { scope: "public" | "private", maxAge, swr, tags } })` lives at `GET <path>/_.query/<id>?a=<encodeReply string>`, route-bound like actions so the path's proxy chain runs (resolves gap 4).
- Arguments whose encodeReply output is FormData (a Blob, File, stream or Promise) are a build error for literal arguments and a runtime 415 otherwise (resolves gap 16).
- A reply over 8 KiB is POSTed with the `query` guard and never cached.
- Public scope is static: cookies(), headers(), session() and undeclared search params throw inside a public query. Arguments end up in access logs and CDN keys, and the docs say never to pass PII.

### 7.6 Middleware

One middleware type for actions, queries, route.ts handlers and Defer targets (resolves gap 10):

```ts
export const requireUser = defineMiddleware<{ user: User }>({
  phase: "pre",                // default: before the body is decoded, no input
  run: async ({ ctx, next }) => {
    const user = await usersFromSession(await session());
    if (user === undefined) throw new ActionError({ code: "UNAUTHORIZED" });
    return next({ user });
  },
});
// actions and queries:  defineAction({ use: [requireUser], ... })
// route.ts:             export const use = [requireUser];
// server islands:       <Defer use={[requireUser]}>  (pre phase only)
```

`phase: "post"` runs after decode and validation and sees the typed input; it applies to actions and queries only. Global hooks are exports of the root or a segment proxy.ts: `onAction` runs before decoding for every action of that segment.

### 7.7 Request APIs, control signals and taint

Request APIs and control signals as listed in section 2. `cookies()` and `session()` are mutable in actions, route handlers and proxy.ts only, and throw on write elsewhere. A cookie or session change in a serial action implies refresh. `redirect()` in a JS call renders the target in-process into the same response; in a no-JS post it is a 303. `/rsc/server` re-exports `experimental_taintObjectReference` and `experimental_taintUniqueValue`, and the security docs present them next to sealing as defense in depth (resolves gap 13).

### 7.8 Raw Response returns

Allowed. On a no-JS post only a redirect, an attachment or a non-HTML content type is allowed unless `allowDocumentResponse` is set; `nosniff` is always added, and a Set-Cookie header not set through cookies() is stripped. **(planner default)**

### 7.9 Limits

One `limits` config block owns every decoder (resolves inconsistency 19):

```ts
limits: {
  body: "1mb", parts: 256, fields: 512, files: 8, fileSize: "1mb", bodyReadMs: 10_000,
  replyArraySize: 100_000,                 // decodeReply arraySizeLimit
  islandProps: "16kb", islandUrl: 2048, codecDepth: 32, codecEntries: 1000, codecBigIntDigits: 300,
  deferTags: 32, deferTagLength: 256, deferSearchKeys: 8, deferSearchBytes: 512,
  islandRenderMs: 10_000, interactionQueue: 32, submitWatchdogMs: 8_000,
  flashBytes: 2048, sessionBytes: 4096,
}
```

Per-action `limits` override `body`, `parts`, `files` and `fileSize` for that action only.

## 8. Islands

The islands design (`islands.api` and `islands.internals`) is canonical (resolves inconsistencies 1, 2, 3 and 11). The actions design's server Island with a nested Flight model per island is dropped, and SA7 merges into S-I1 and S-I2.

### 8.1 API

```tsx
import { Island, ClientOnly } from "@eserstack/laroux/client";        // "use client", framework references
import { any, interaction, only, visible, never, custom } from "@eserstack/laroux/islands";

<Island when={any(visible({ rootMargin: "300px" }), interaction())} prefetch={visible({ rootMargin: "1200px" })}>
  <Reviews productId={product.id} onSubmit={addReview} />
</Island>
<Island when={never()}><Specs product={product} /></Island>
<Island when={only()} fallback={<MapSkeleton />}><StoreMap /></Island>
<ClientOnly fallback={<MapSkeleton />}><StoreMap /></ClientOnly>   {/* alias of when={only()} */}
<Island when={custom("hoverIntent", { delayMs: 120 })}><Menu /></Island>
```

- Strategies are JSON-safe data from `/islands`: load, idle, visible, media, interaction, signal, only, never, any, custom.
- Custom strategies are registered in `islands.strategies` in laroux.config and typed through module augmentation of `CustomHydrationStrategies`. A handler is `StrategyHandler({ element, options, hydrate, prefetch, signal })`.
- Client components outside any Island hydrate with the root, as in standard RSC. `islands.defaultStrategy` sets the default `when` (default `load`).
- One event pair on the marker, both bubbling: `laroux:island-hydrated` `{ id }` and the cancelable `laroux:island-error` `{ id, error, reference }`.
- Client API: useIslandState, hydrateIsland, openIslandSignal, prefetchIsland.

### 8.2 Runtime

- One React root: hydrateRoot on the document from inline Flight.
- `<Island>` renders `<laroux-island data-li data-when style="display:contents">` around a Suspense boundary whose Gate suspends on a gate promise, so React keeps the server HTML dehydrated until a strategy opens the gate.
- A still-pending Gate that renders a second time opens its gate, so an update reaching a dehydrated island hydrates it early instead of wiping its HTML. laroux keeps its own updates inside transitions and out of context (router state through useSyncExternalStore stores). S-I2 pins this against react-dom 19.3.1 internals, and the tests run on every React bump.
- Code deferral: transform (i) rewrites the direct client children of an Island whose `when` is not statically `load()` into alias references `<ref>~d`. The browser loader holds alias targets until a gate or prefetch releases them, and SSR emits no modulepreload for aliases. Client components under server children inside an Island load eagerly (hydration is still gated), the same scope as TanStack's.
- Pre-hydration script: a `laroux-island` custom element whose connectedCallback registers each island, including those that stream in later, and starts the built-in strategies. Pages without a counted reference get no script.
- Errors: an error boundary per island keeps an inert clone of the server HTML, dispatches the error event, and retries a failed import once. The route generator wraps every layout and page segment in a Suspense boundary, so a mismatch outside islands client-renders only that segment.

### 8.3 Zero-JS pages

`js: "auto"` (route export, default): a page ships React, the router, inline Flight and the bootstrap only when SSR resolves a counted client reference. Framework references (Island, Gate, ClientOnly, DeferBoundary under stream mode, and aliases under never()) do not count (resolves inconsistency 13). A fetch-mode DeferBoundary counts in R1, because the browser needs React to swap Flight into the root. `js: "none"` turns a counted reference into an error. The `framework: true` tag is a build-time property of the reference manifest that only laroux's own modules get.

### 8.4 Islands and actions

- An action that returns `tree` commits it in a transition. Before the commit, the client releases the chunks of dehydrated islands on retained layouts, the same path as navigation, so their gates open during the commit without waiting on the network. The docs say that a refresh hydrates visible(), idle() and never() islands on the page; actions that do not need a new tree should return `invalidate` only, which keeps them dehydrated (resolves gap 1). Segment-level diffing in phase 2 keeps retained segments dehydrated. S-I2 has this case as a pass criterion.
- A form inside a never() island posts natively even when JS is running, because the island's code never loads. The docs say so, and recommend `interaction({ events: ["submit"] })` for forms that should be enhanced (resolves gap 18).
- The opt-in interaction submit watchdog fires a native resubmit only when the gate never opened or the chunk load failed. It is disarmed as soon as hydration commits and requestSubmit has been dispatched. Each replayed submit carries `x-laroux-call`, which the idempotency port can dedupe once it lands (resolves gap 7).

## 9. Server islands (`<Defer>`)

R1 ships both modes (decision-54):

```tsx
import { Defer } from "@eserstack/laroux/rsc/server";

<Defer
  fallback={<ReviewsSkeleton />}
  mode="auto"                          // "auto" | "stream" | "fetch"
  props="signed"                       // "signed" (default) | "sealed"
  bind="segment"                       // "segment" (default) | "page"
  cache={{ scope: "public", maxAge: 60, swr: 300, tags: [`reviews:${id}`] }}
  searchParams={["sort"]}
  use={[rateLimitIslands]}
  noscript={<a href={`/product/${id}/reviews`}>Read reviews</a>}
>
  <LatestReviews productId={id} />
</Defer>
```

- `auto` resolves to `stream` on dynamic routes (and for bots, 4.5) and to `fetch` on `prerender: true` routes and in the prelude of partial routes.
- `stream` is Suspense in the same response with out-of-order Flight and HTML.
- `fetch` is a separate request to `<owning segment path>/_.island/<id>?t=<token>[&<declared search keys>]`. A layout-level Defer has one URL on every page.
- The child is exactly one element whose type is a module-level server component; its props must fit the island props codec (JSON plus Date, Map, Set, BigInt, URL, typed arrays, undefined and special numbers). Children and slots are a build error in R1.
- Tokens: signed by default, `v1.<kid>.<codec>.<tags>.<payload>.<mac>`, HMAC-SHA-256 under the `island-sign` subkey over version, kid, codec, id, segment pattern, tags and payload, so the same props give the same URL even from per-request shells. `props: "sealed"` uses AES-256-GCM with a random IV under `island-seal` and is confidential, but its URL is stable only in cached or prerendered shells. The actions design's SIV construction is dropped (resolves inconsistency 12).
- Props are readable in signed tokens, and the docs say so; dev warns on props named like secrets.
- The props codec is laroux-owned and versioned, decodes only after the MAC or AEAD check, builds null-prototype objects, rejects prototype keys and enforces the codec limits. The decoder accepts the current and the previous codec version, so a React upgrade never invalidates cached tokens. **(planner default over React's encodeReply)**
- Dispatch order: rate limit and body cap; method (GET or POST, else 405); the island guard (5); manifest lookup by id (unknown gets 404 before any module loads); token parse (400 for bad format, 409 for an unknown codec or kid, 400 for a failed MAC); segment pattern check; the Defer's `use` middleware; props decode; render inside the request store with the island flags (scope, cookie and session writes throw, a time budget, the search-param allow-list).
- Public scope: cookies(), headers(), session() and undeclared search params throw. The CacheProvider stores only public responses, with `Cache-Tag` and `Surrogate-Key` headers. Responses that set cookies are never stored.
- `islandContext()` returns the signed segment pattern and params, the locale, and the declared search params as an untrusted hint.
- Client: during SSR the DeferBoundary renders the fallback and preloads the URL as fetch; after hydration it calls createFromFetch on the same URL and swaps the content in inside startTransition, sharing the page's context.
- Island render errors return 500 with a generic body and a digest, and go to onRequestError with kind `island`.

## 10. Prerendering and partial prerendering

Route exports (resolves inconsistency 17):

```ts
export const prerender = true;           // true | false (default) | "partial"
export const js = "auto";                // "auto" | "none"
export function staticParams() { return [{ id: "1" }, { id: "2" }]; }   // with i18n, multiplied by locales
```

### 10.1 `prerender: true`

- `laroux build` runs a prerender step after the ssr build: a Node worker loads the node-platform rsc and ssr bundles and writes `index.html` and `_.rsc` for each route and each staticParams entry.
- The runtime serves these files before the app handler, on Node from dist/client and on Workers from static assets. A prerendered route under a proxy.ts scope is a build error unless the proxy declares `export const allowPrerender = true`, which states that it does not guard those routes.
- A POST to a prerendered page still runs the action and renders dynamically with formState.
- Prerendering for a Workers target runs in Node at build time. A prerendered route that reads Worker bindings is a build error.

### 10.2 `prerender: "partial"`

R1 (decision-54), on a spike that has to show how, not whether (S-I7, TASK-287; if it fails, the owner decides what replaces it):
- Build: Flight `prerender` with dynamic APIs postponed (rsdw 19.3.1 halted tasks emit nothing, verified), then Fizz `prerender` with abort, which gives the static prelude and the postponed state.
- Dynamic holes are the Suspense boundaries above code that calls a dynamic API: cookies(), headers(), session(), locale detection, searchParams or `connection()`. A dynamic API outside any Suspense boundary is a build error on a partial route.
- Request: the app handler runs (i18n, sessions, proxy chain), then streams the prelude at once, renders Flight in full (rsdw 19.3.1 exports no Flight resume, verified), and continues with react-dom `resume(postponed)`. Partial routes therefore always reach the server; only their prelude bytes are static.
- Postponed state: on Node in `dist/server/ppr/`; on Workers bundled into the Worker as a JSON module under a size budget, otherwise in static assets on a path the Worker blocks externally. S-I7 decides the budget.
- The prelude is cacheable output (6.4). CSP on partial routes: prelude script hashes plus a nonce for the resumed scripts in one header, or nonce mode is refused on partial routes if S-I7 shows a conflict.

## 11. Caching

Next-compatible names in `/rsc/server` (resolves inconsistency 9): `refresh()`, `revalidatePath(path, "page" | "layout")`, `revalidateTag(tag, { mode: "swr" | "expire" })`, `updateTag(tag)` and `cached(fn, { tags, ttl })`. `invalidateTag` is dropped.

One port:

```ts
interface CacheProvider {
  get(key: string): Promise<Response | undefined>;
  put(key: string, response: Response, meta: { tags: string[]; maxAge: number; swr: number }): Promise<void>;
  purge(target: { tags?: string[]; paths?: string[] }): Promise<void>;
}
```

- Node: a bounded memory LRU per process (max entries, max bytes); multi-instance deploys need a shared provider or a CDN.
- Workers: `caches.default`, which works only on custom domains, never stores Set-Cookie responses and purges one data center per delete (verified by the critique). Global freshness comes from bounded maxAge plus swr.
- Only public-scope responses are stored. Public responses carry `Cache-Tag` and `Surrogate-Key`.
- A CdnPurger adapter behind `purge` is phase 2.

## 12. Sessions

R1 (decision-54). New design, modeled on Astro's sessions; no spike has checked it yet, so TASK-285 covers the Workers driver.

API, from `/rsc/server`:

```ts
const s = await session();
await s.get<User>("user");                 // undefined when absent
await s.set("cart", cart, { ttl: "2h" });  // writes allowed in actions, route handlers and proxy.ts
await s.delete("cart");
await s.regenerate();                      // new id, same data: call it on login and privilege changes
await s.destroy();
s.id;                                      // opaque, never logged
```

Config:

```ts
sessions: {
  driver: "memory",                        // "memory" | "cookie" | "cloudflare-kv" | a SessionDriver module path
  cookie: { name: "laroux_session", sameSite: "lax", httpOnly: true, secure: "auto", path: "/" },
  ttl: "7d",
  rolling: true,                           // refresh the expiry on read, at most once per ttl/10
  kv: { binding: "SESSIONS" },             // cloudflare-kv only
}
```

Rules:
- Lazy: nothing is read until `session()` is called, and no cookie is set until something is written.
- Ids are 256 random bits from WebCrypto. The cookie holds the id only, except for the `cookie` driver, which holds the data sealed under the `session` subkey and is capped by `limits.sessionBytes`.
- Values go through the island props codec, so Date, Map, Set and BigInt survive, and decoding uses the same hardening.
- Writes outside actions, route handlers and proxy.ts throw, like cookie writes. Reads are allowed in private, dynamic renders. In cacheable output (6.4) and in public-scope islands and queries, `session()` throws.
- A session change in a serial action implies refresh.
- `bindToSession` on sealed values binds to the session id.

Driver port:

```ts
interface SessionDriver {
  get(id: string): Promise<Uint8Array | undefined>;
  set(id: string, data: Uint8Array, ttlSeconds: number): Promise<void>;
  delete(id: string): Promise<void>;
}
```

R1 drivers:
- `memory`: Node and dev, a bounded per-process map; the docs say it does not survive restarts or span instances.
- `cookie`: stateless, both targets; needs the keyring.
- `cloudflare-kv`: Workers, through a KV binding. KV is eventually consistent, so a write may not be visible from another location at once, and the docs say so.
- Any module path that exports a SessionDriver (for example a Redis driver an app writes).

## 13. i18n routing

R1 (decision-54). New design, modeled on Astro's i18n routing:

```ts
i18n: {
  locales: ["en", "tr", { code: "pt-BR", path: "pt" }],
  defaultLocale: "en",
  routing: {
    prefixDefaultLocale: false,            // "/about" is en, "/tr/about" is tr
    redirectToDefaultLocale: true,         // with prefixDefaultLocale, "/" redirects to "/en"
    detect: ["cookie", "accept-language"], // only on "/" and on paths without a locale, never for bots
  },
  cookie: "laroux_locale",
  domains: { tr: "https://example.com.tr" }, // optional; the locale follows the host
}
```

- One route tree. The matcher strips the locale prefix before matching, and the route files never contain a `[locale]` segment. `locale()` in server code and `useLocale()` on the client return the current locale.
- Detection redirects use 307, `Vary: Cookie, Accept-Language` and `Cache-Control: private`. Bots never get a detection redirect.
- Helpers in `/rsc/server`: `locale()`, `locales()`, `localizedPath(path, locale)` and `alternateLinks()` for hreflang tags. `<Link locale>` on the client.
- `staticParams()` is multiplied by locales for prerendered routes.
- With `domains`, each domain's origin joins `allowedOrigins`, and the prefix is not used on that domain.
- The proxy chain and route binding see the path without the locale prefix, so one proxy.ts covers every locale.
- laroux ships routing, not message catalogs; apps bring their own translation library.

## 14. Typed env split

R1 (decision-54, resolves gap 11). Modeled on Astro's astro:env:

```ts
import { defineConfig, envField } from "@eserstack/laroux/config";
export default defineConfig({
  env: {
    schema: {
      PUBLIC_API_URL: envField.string({ context: "client", access: "public" }),
      STRIPE_KEY: envField.string({ context: "server", access: "secret" }),
      FEATURE_X: envField.boolean({ context: "server", access: "public", default: false }),
    },
  },
});
```

- `context: "client"` values are public by definition and are inlined at build time into client and server graphs, read from `import { PUBLIC_API_URL } from "@eserstack/laroux/env/client"`.
- `context: "server"` values are read at run time from the HostContext env (process.env on Node, the Worker env on Workers) through `@eserstack/laroux/env/server`, which is react-server only, so importing it from a client graph is a build error. They are never inlined.
- Validation runs at build for client values and at startup (first request on Workers) for server values; a missing required value fails.
- Without a schema, only `PUBLIC_`-prefixed variables reach client graphs. `process.env.X` or `import.meta.env.X` for a non-public name in a client graph is a build error.
- Defense in depth: after the client build, a scan fails the build when the build-time value of any server variable longer than 8 characters appears in a client chunk.
- The bundler's env plugin stays laroux-free: it takes the allow-list of names and values that laroux-server's adapter computes.

## 15. onRequestError

One hook (resolves gap 14), exported from the root `src/app/proxy.ts`, or passed to `createHandler` (section 16):

```ts
export function onRequestError(
  error: unknown,
  request: { method: string; url: string; headers: Headers },   // url without the query string
  context: { kind: "page" | "route" | "action" | "query" | "island" | "proxy"; routePattern: string; digest: string; actionName?: string },
): void | Promise<void> {}
```

- It replaces the actions design's `onActionError`.
- Production responses carry a generic message and the digest; the hook gets the full error.
- It runs through waitUntil and never delays the response. An error thrown by the hook itself is logged and swallowed.
- Control signals (redirect, notFound and others) and expected ActionErrors are not errors and do not reach it.

## 16. Composable fetch handlers

R1 (decision-54, resolves gap 9). An optional `src/server.ts` replaces the default composition:

```ts
// src/server.ts
import { createHandler, i18n, sessions, actions, queries, islands, routes, pages, notFound } from "@eserstack/laroux/server";
import { requestId } from "./server/request-id.ts";

export default createHandler({
  steps: [requestId, i18n(), sessions(), actions(), queries(), islands(), routes(), pages(), notFound()],
  onRequestError: (error, request, context) => { /* ... */ },
});
```

- A step is `(request: Request, ctx: StepContext, next: () => Promise<Response>) => Promise<Response>`. `ctx` carries the HostContext, the matched route once a step has matched it, and `locals`.
- Each endpoint step runs its own guard, route binding and proxy chain inside its dispatch, so a custom order or a custom step in front cannot skip them. The proxy.ts chain runs once per request, inside the first endpoint step that matches.
- Without src/server.ts the default is `[i18n(), sessions(), actions(), queries(), islands(), routes(), pages(), notFound()]`, with i18n and sessions present only when configured.
- Mounting in another fetch host: the build emits `dist/server/entry.js` with `export default { fetch(request, env, ctx) }`, which the Workers runtime calls directly and any other fetch host (Hono, a Node framework with a fetch adapter) can call. `dist/server/index.js` wraps it in laroux-server's Node host. `base` in config mounts the app under a path prefix.

## 17. CSP

- A per-request nonce threaded into Fizz, the rsdw edge client, the inline Flight, the bootstrap and the pre-hydration script, sent as a header and on in dev.
- Prerendered pages: SHA-256 hashes of their inline scripts, sent as a header (runtime/ on Node, the `_headers` path on Workers, S-I8).
- Partial routes: see 10.2.
- Flight responses: the sandbox policy in 4.3.

SA15 checks nonce threading on streamed pages with islands.

## 18. Dev and HMR

decision-51: client HMR on rolldown's DevEngine with a DevRuntime that implements import.meta.hot, React Fast Refresh, and server component edits that refetch `<path>/_.rsc` and keep client state. doc-2's dev section and the two designs' dev rules apply, with these merged points:
- Ids are stable in dev. Changing a client-visible action option changes the id's flags byte; the stub module is re-emitted and self-accepts, and an open page holding the old id gets 409 with a dev overlay naming the change until the next rsc:update.
- Editing a "use server" module rebuilds rsc, regenerates the reference table and the binding manifest, swaps the server runner after in-flight calls drain, and updates the client only when exports or flags changed.
- Editing a client module under a dehydrated island opens that island's gate and releases its hold. The dev hold policy covers DevEngine module URLs as well as production chunk keys.
- Mounted fetch-mode islands refetch with `cache: "reload"` after an rsc rebuild touches their graph. The CacheProvider runs observe-only in dev.
- The guard, limits, public-scope throws and the CSP nonce stay on in dev.
- Workers apps use the Node dev server; workerd is covered by `laroux preview --target workerd` and by CI (planner default; parity row worse than Astro's workerd dev).
- If S7 shows DevEngine cannot carry this, the fallback is laroux's own HMR runtime over rolldown watch, and the owner reviews that cost first (decision-51).

## 19. Node and Cloudflare Workers

decision-52. One fetch entry for both targets:
- Flight: the rsc graph resolves rsdw's server.node build on Node and server.edge on workerd; the ssr graph uses client.node or client.edge.
- Bodies: a byte-counting stream into `new Request(body).formData()` or `text()`, then decodeReply, on both targets. No custom multipart parser.
- Crypto: WebCrypto only.
- Node: `node dist/server/index.js`, self-contained, with no node_modules.
- Workers: `laroux build --target workerd` writes the Worker bundle with nodejs_compat, wrangler config, dist/client for static assets, the `_headers` file for prerendered CSP hashes, and Worker-first routing for `/_.rsc`, `/_.query/`, `/_.island/` and `/_laroux/` paths if S-I8 shows static assets would answer them. Secrets come from the Worker env.
- Rate limiting on Workers is isolate-local in R1 and documented as weak.

**The ajan bridge on Workers.** workerd has no node:ffi, so the ajan loader uses the wasi-profile reactor there (decision-45, amended 2026-10-24; TASK-318): the Worker bundle imports eser-ajan.wasm as a Wasm module through the ajan `workerd` condition, one instance per isolate is built on the first call, and it runs on the plain WASI shim. The build fails when the rsc or ssr graph reaches `node:ffi` or a binding outside the profile; the fs names answer a typed error unless L-S4 finds a preopen, and the network names work only if TASK-277 shows JSPI works on workerd. L-S4 measures the load time, memory and the bundle's compressed size against the Workers limits.

## 20. Build flow

`laroux build`: config (laroux.config.ts, the env plugin), environments (client, ssr, rsc, all server graphs fully bundled), then the adapter's buildApp:
1. rsc scan (write: false): "use client" and "use server" modules, Defer children, Island children.
2. rsc: client-reference proxies, server-reference registration with hashed ids, the reference table, the binding manifest, island manifest.
3. client: entry.browser, one dynamic entry per client reference, alias entries, server-reference stubs, CSS, the env split.
4. ssr: real client modules, consumer manifest, assets manifest.
5. prerender (Node worker): `prerender: true` pages, partial-route preludes and postponed state.
6. finalize: critical CSS, precompression, `dist/server/index.js` and `entry.js`, `laroux-build-keys.json`, the client-chunk secret scan, `--keep-assets` copies, `dist/.laroux/build.json`.

## 21. Testing

From the two designs, merged:
- Unit tests next to the code for transforms, id derivation, seal and unseal, the keyring, guard decision tables, resolveBodyCap, structural FormData decoding, the client queue, status-to-code mapping, state mode, strategy constructors and handlers, the gate registry, the props codec, tokens, the island endpoint, sessions (every driver against one contract suite), i18n matching and redirects, the env split and its client-chunk scan, onRequestError routing, and handler composition (a custom step in front cannot skip a guard).
- A React contract suite that runs on every react or rsdw patch (encodeReply and decodeReply across tags, temporary references, Fizz form fields, decodeAction and decodeFormState, wire tag changes, the bind call in React's decoder, the startup same-version check), plus a scheduled run against react@latest and react@canary (decision-59).
- An HTTP-level security regression suite against Node and workerd builds, seeded by TASK-271's tests.
- Real-browser tests in Chromium, Firefox and WebKit (SA14, islands, CSP, bots, i18n detection). Playwright drives them (decision-57).
- The conformance harness (TASK-315): fixtures built with `laroux build` and served from a directory with no node_modules, on Node and in `wrangler dev`.
- Skew tests across two builds (S13).
- `/rsc/testing`: callAction returning `{ data, error, effects }`, submitForm and createTestRequest.

## 22. Spikes

All run in the scratchpad on the pinned Node 26 minor, before the implementation tasks they gate. Names from the design run are kept for traceability.

| Task | Spikes | Gates |
| --- | --- | --- |
| TASK-282 (L-S1) | S1 (three graphs on plain rolldown with rsdw and plugin-rsc's /transforms as dependencies; record what they install), SA3 (manifest-only resolution, webpack globals through define and inject), SA13 (route binding from per-entry graphs), S-I1 (alias references and the hold policy) | L2a, L4a, L4b, L4e, L5b |
| TASK-283 (L-S2) | SA1 (envelope with tree), SA2 (progressive enhancement through laroux stubs), SA4 (body handling), SA10 (decoder abuse and CPU), SA11 (in-process redirect), SA14 (Fetch Metadata in real browsers), SA15 (CSP nonce threading) | L4a, L4c, L4d, L4g, L4h |
| TASK-284 (L-S3) | S-I2 (updates reaching dehydrated islands, action refreshes), S-I3 (interaction replay), S-I4 (bytes and hydration cost against Astro), S-I5 (zero-JS detection), S-I10 (marker edge cases) | L4e |
| TASK-285 (L-S4) | S12 and S-I8 (workerd target, static assets, POST routing, `_headers`), SA5 (AsyncLocalStorage on workerd), S-I6 (fetch-mode islands on both targets), S9 (runtime.http against srvx), the KV session driver, the ajan reactor on workerd | L4f, L4j, L5a, L5e, L8 |
| TASK-286 (L-S5) | S6 (server runner), S7 (DevEngine, Fast Refresh, import.meta.hot), SA8 (action HMR), S-I9 (island HMR) | L5d |
| TASK-287 (L-S6) | S-I7 (partial prerendering on Node and workerd) | L4i, L5b |
| TASK-288 (L-S7) | S13 and SA9 (skew across two builds, key rotation), S-I12 (codec and keyring robustness) | L4a, L4f |

Dropped with decision-53: S2, S3, S4, S5, S8, S10, S11. Dropped with decision-48: the vendor-freshness job and the lockfile gate. S0 is TASK-271.

## 23. Parity after R1

The two designs' parity matrices stand, with these rows moved by decision-54 and this merge:
- Sessions: worse, now equal with Astro (memory, sealed cookie, KV, custom drivers).
- i18n routing: worse, now equal (prefix routing, detection, domains, hreflang); laroux ships no message catalogs.
- Separately cacheable server fragments: worse (phase 2), now better pending S-I6.
- Partial prerendering: worse, now equal with Next pending S-I7, except that laroux re-renders Flight in full per request.
- Typed env split: missing, now equal with astro:env.
- Composable fetch handlers: missing, now equal with astro/fetch.
- Unified error hook: missing, now equal with Next's onRequestError.

Rows that stay worse in R1: FormData coercion from the schema, custom serialization adapters, a data cache directive, a static query cache, client-side per-function middleware, offline retry and idempotency, workerd dev, static-content payload on island pages, pages whose only dynamic part is a server island, root-level mismatch isolation, Defer children and slots, CDN invalidation, moving an island across layouts.

## 24. Resolution index

Inconsistencies between the two designs:

| # | Topic | Resolved in |
| --- | --- | --- |
| 1 | How islands are built | 8 |
| 2 | Strategy API and client-only rendering | 8.1 |
| 3 | Island events | 8.1 |
| 4 | Secrets and keyring | 6.2 |
| 5 | Id threat model | 6.1 |
| 6 | Request store instances | 3.1 |
| 7 | Host entry signature | 3.1 |
| 8 | Action envelope and refresh signal | 4.2 |
| 9 | Cache API names and ports | 11 |
| 10 | Subpaths and peers | 2 |
| 11 | Bundler alias entries | 2, 8.2 |
| 12 | Defer scope and crypto | 9 |
| 13 | Zero-JS rule | 8.3 |
| 14 | Guard on the island endpoint | 5 |
| 15 | Endpoint binding | 7.4 |
| 16 | Client skew handling | 4.4 |
| 17 | Prerender concept | 6.4, 10 |
| 18 | Ids in dev | 6.1 |
| 19 | Decoder limits | 7.9 |

Gaps the critique found:

| # | Topic | Resolved in |
| --- | --- | --- |
| 1 | Action refreshes and dehydrated islands | 8.4 |
| 2 | Seal lifetime in public Defer fragments | 6.4 |
| 3 | Keys at build time | 6.2 |
| 4 | Query URL against prerendered output | 3.2, 7.5 |
| 5 | Router cache after actions | 4.2 |
| 6 | Crawlers and fetch-mode Defers | 4.5 |
| 7 | Double execution from the submit watchdog | 8.4 |
| 8 | Post path of route-bound actions | 7.4 |
| 9 | Composable request handlers | 16 |
| 10 | Shared middleware | 7.6 |
| 11 | Typed env split | 14 |
| 12 | Framework gaps against Astro | 1, 12, 13 (content collections, images and fonts stay separate designs) |
| 13 | React taint APIs | 7.7 |
| 14 | Unified error hook | 15 |
| 15 | Header hook for internal fetches | 4.6 |
| 16 | FormData-shaped query arguments | 7.5 |
| 17 | Forms in iframes | 5 |
| 18 | never() islands holding forms | 8.4 |
| 19 | Response headers on island responses | 4.3 |

## 25. Owner answers

The owner answered the five open questions on 2026-10-24:

1. **eserstack libraries on Workers after M6:** the ajan loader on workerd uses the wasi-profile reactor for the profile's names, and the workerd build fails for every binding outside the profile. This widens decision-45's hosts to Cloudflare Workers (decision-45 and decision-52, amended; TASK-318; section 19).
2. **Browser driver:** Playwright, in Chromium, Firefox and WebKit (decision-57). An agent-driven browser stays a manual debugging aid; it is not a test driver.
3. **Versioning:** additive in 5.x with a short window: the old pipeline is deprecated for one 5.x minor and deleted in 6.0.0, the major right after R1 (decision-58; TASK-317).
4. **React and rsdw range:** a tilde range on the newest stable release, kept current: each laroux release requires the newest React minor that passes the contract suite, and a scheduled job tests react@latest and react@canary (decision-59).
5. **Headerless unsafe requests:** rejected with 403 FORBIDDEN unless the action sets `headerless: "allow"`, and documented in the laroux README with a dev log line on each rejection (decision-60; section 5).

## 26. Track L tasks

Milestone m-7. Each task is one package (spikes and the ADR task touch no package). Dependencies are in each task.

- TASK-280: laroux-server: run the proxy chain of the requested path for GET /rsc (interim, old pipeline)
- TASK-281: laroux-server: escape comment and script openers in the inline payload of the await-all shell (interim, old pipeline)
- TASK-282 (L-S1) to TASK-288 (L-S7): the spikes in section 22
- TASK-289 (L0): ADRs 0006 to 0008 and the decision-46 amendment
- TASK-290 (L2a): bundler: environment host, AppBuilder, EnvironmentManifest, define, inject and alias entries
- TASK-291 (L2b): bundler: CSS, assets, env, fonts and images plugins
- TASK-292 (L3): standards: runtime.http drain, timeouts, unix socket, trustProxy and upgrade identity
- TASK-293 (L4a): laroux: /rsc runtime core
- TASK-294 (L4b): laroux: /rsc/transforms
- TASK-295 (L4c): laroux: /actions and /rsc/server
- TASK-296 (L4d): laroux: /browser and the client router
- TASK-297 (L4e): laroux: islands runtime in /islands and /client
- TASK-298 (L4f): laroux: server islands
- TASK-299 (L4g): laroux: /guard
- TASK-300 (L4h): laroux: /ssr
- TASK-301 (L4i): laroux: partial prerendering
- TASK-302 (L4j): laroux: sessions
- TASK-303 (L4k): laroux: i18n routing
- TASK-304 (L4l): laroux: /config and the typed env split
- TASK-305 (L4m): laroux: composable fetch handlers in /server and onRequestError
- TASK-306 (L4n): laroux: /rsc/testing
- TASK-307 (L4o): laroux: take over laroux-react's surviving modules and deprecate laroux-react
- TASK-308 (L5a): laroux-server: runtime/ fetch host
- TASK-309 (L5b): laroux-server: adapters/native
- TASK-310 (L5c): laroux-server: cli/
- TASK-311 (L5d): laroux-server: dev/ with HMR and Fast Refresh
- TASK-312 (L5e): laroux-server: Cloudflare Workers target
- TASK-313 (L5f): laroux-bundler: move the generic modules to bundler and deprecate the package
- TASK-314 (L6a): codebase: laroux package-boundary and workerd-graph validators
- TASK-315 (L6b): conformance harness on Node and workerd
- TASK-316 (L7): recipes: laroux-app and laroux-workers-app on R1
- TASK-317 (L9): delete the old laroux pipeline in the major after R1
- TASK-318 (L8): ajan: load the wasi reactor on Cloudflare Workers

## 27. Impact on the Deno exit plan

- TASK-179, TASK-207, TASK-208, TASK-209: stay mechanical. Files that track L deletes (laroux-react client/bootstrap, protocol.ts, client.ts; laroux-bundler system.ts and the import-map resolver) get no redesign; their tests are tagged `track-l-delete` so TASK-317 can find them.
- TASK-180: unchanged; TASK-292 adds the rest of doc-2's runtime.http scope.
- TASK-181: unchanged scope; its HMR fixes keep the old dev server working until TASK-311 replaces it.
- TASK-182: unchanged; TASK-290 builds the new host beside the backend it keeps.
- TASK-227 and TASK-237: unchanged; TASK-237's smoke job is reused by TASK-315, and its "one action registry" check becomes "one React per graph" in track L.
- TASK-240: the template patches move to the R1 shape after TASK-316 (TASK-316 notes the follow-up).
- TASK-267 AC #5 (laroux builds with ESER_AJAN=disabled) and TASK-184 stay; TASK-314's workerd-graph validator adds that no laroux server graph for workerd reaches node:ffi or a binding outside the wasi profile.
- decision-46: amended by TASK-289 for the subpath list and the react-dom peer.
- decision-50 and decision-52: amended on 2026-10-24 (Start sentences void; the WASM figure updated; the Workers question answered with the reactor on workerd).
- decision-45: amended on 2026-10-24 to add Cloudflare Workers as a host (TASK-318).
- TASK-277: also records whether JSPI works on workerd.
