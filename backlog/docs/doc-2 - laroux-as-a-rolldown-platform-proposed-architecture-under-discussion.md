---
id: doc-2
title: 'laroux as a rolldown platform: proposed architecture (under discussion)'
type: specification
created_date: '2026-10-15 22:00'
---

# laroux as a rolldown platform, revised: one core, two framework adapters (laroux-native RSC with React server actions, and TanStack Start), fully bundled fetch output served by a plain Node host, with no vite, webpack, Nitro or Hono package in the tree

Status: proposal for discussion with the owner (2026-10-16). Nothing here is decided. Source: a research and design run (7 sweeps of the code and the web, three drafts judged by three reviewers: own-framework-plus-adapter 24, host-for-start 22.5, vite-compatible-core 16.5; winner own-framework-plus-adapter; then a critique and a revision).

Goal: run TanStack Start apps without Nitro and Hono, run React Server Components and server actions, and bundle with rolldown without Vite.

## Owner decisions so far

doc-3 (2026-10-24) is the unified track L design and supersedes this document's RSC and server actions sections, its Start sections and its spike list. Read this document for the bundler host, the dev worker and the request pipeline background.

These override the text below where they disagree.

- **Three packages (decision-46, 2026-10-23).** @eserstack/laroux holds what app code imports (`/config`, `/client`, `/rsc` with the vendored Flight runtime, `/rsc/transforms`). @eserstack/laroux-server is the tool, published to npm as `laroux` (`cli/`, `dev/`, `adapters/native`, `adapters/start`, `runtime/`), and owns the FrameworkAdapter port. @eserstack/bundler stays free of React and laroux. laroux-bundler and laroux-react are removed, and laroux-rsc, laroux-dev and laroux-start are never created; read the Components section below with that mapping.
- **npm imports (decision-47, 2026-10-23).** App code imports the scoped @eserstack packages from npm. The bare npm packages `laroux` and `eser` are for running the tools.
- **Vite optional (decision-48, 2026-10-23).** laroux needs neither Vite nor webpack, an app may still install Vite beside it, and no gate checks for either. The Flight runtime and RSC transforms become plain dependencies unless S1 shows vendoring is needed. The lockfile gate and the vendor freshness check are dropped.
- **srvx accepted (decision-49, 2026-10-23).**
- **Own framework kept (decision-50, 2026-10-23).** laroux-native stays a first-class framework next to Start.
- **HMR and Fast Refresh in the first release (decision-51, 2026-10-23).** Phase 2 of the dev flow moves into the first release; S6 and S7 run right after S1.
- **Node and Cloudflare Workers in the first release (decision-52, 2026-10-23).** S12 is required and runs with S1.
- **No TanStack Start adapter (decision-53, 2026-10-23).** laroux ships only its own framework, with its own React server functions on Flight. Everything below about laroux-start, start-plugin-core, createServerFn and the Start spikes (S2-S5, S8, S10, S11) no longer applies, and decision-49 is moot.
- **First-release scope (decision-54, 2026-10-23).** R1 adds cacheable server islands, partial prerendering, a typed env split, one onRequestError hook, built-in sessions, i18n routing and composable fetch handlers.

## Summary

This revision keeps the shape of the previous design and fixes every point the critique raised. Facts re-checked today (2026-10-16) in the scratchpad are marked "verified"; anything taken from earlier research and not re-read is marked "unverified".

**Shape.** One generic core with two framework adapters on it.

Core:
- @eserstack/bundler: a rolldown environment host.
- @eserstack/laroux-rsc: React Server Components and server actions.
- @eserstack/laroux-dev: the CLI and the dev server.
- @eserstack/laroux-server: a lean fetch host, bundled into the output.

Adapters, both behind a FrameworkAdapter port in @eserstack/laroux:
- laroux(): laroux's own file-route RSC framework, with React "use server" actions.
- tanstackStart(): @eserstack/laroux-start, a third Start host next to Start's Vite and Rsbuild hosts.

Both adapters build one output contract: dist/client plus dist/server/index.js. index.js is a single self-contained bundle (the server environments use noExternal: true by default), so a production deploy needs no node_modules.

**What changed from the previous draft, point by point.**

1. **No webpack in the tree.** react-server-dom-webpack@19.3.1 declares `webpack: ^5.59.0` as a required peer with no peerDependenciesMeta (verified with npm view). Its runtime builds need only react, react-dom and Node builtins (verified in the plugin-rsc tarball). laroux-rsc therefore vendors those runtime builds unmodified, the same way @vitejs/plugin-rsc 0.5.38 already does (dist/vendor/react-server-dom/package.json is version 19.3.1, verified). Vendored copies no longer pick up React patches through the package manager, so a refresh script and a scheduled CI freshness check take that job. The lockfile gate now covers vite and webpack. The repo sets no auto-install-peers (`pnpm config get` returns undefined on pnpm 11.18.0); pnpm's default of true comes from its docs and was not tested with an install.

2. **The rsc and ssr graphs are fully bundled.** Both use noExternal: true. The vendored Flight runtime is inside every graph. The `__webpack_require__` and `__webpack_chunk_load__` free identifiers are renamed per environment through transform.define (`__laroux_rsc_require__`, `__laroux_ssr_require__`, `__laroux_client_require__`), so the rsc and ssr graphs never share a global in one process. This fixes:
   - React being loaded twice in the rsc graph through externals
   - third-party "use client" packages never being transformed
   - an externalized copy of the Flight client that the rewrite cannot reach

   A `serverExternalPackages` allow-list exists for native addons. The build fails if a listed package depends on or peer-depends on react.

3. **TS/JSX is lowered before the RSC transforms.** Rolldown runs its built-in TS/JSX transform after plugin transform hooks. So laroux-rsc's hook first calls `transformSync` from rolldown/utils (exported in 1.2.14, verified) on files whose code contains a directive, then runs the vendored plugin-rsc transforms on plain JS ESTree. S1 tests this.

4. **No viteMetadata in the core host.** Start's shared buildStartManifest takes a NormalizedClientBuild. The Vite normalizer is the only code that reads viteMetadata (vite/start-manifest-plugin/normalized-client-build.js:11, verified). laroux-start writes a third normalizer over EnvironmentManifest. It must also derive routeFilePaths and hydrationIds from chunk moduleIds (NormalizedClientChunk, dist/esm/types.d.ts:83-101, verified).

5. **Start internals are imported by file path by default.** start-plugin-core exports ./package.json (verified). react-start pins it to exactly 1.171.53 (verified). Its dist/esm keeps one file per module: start-compiler/compiler.js and host.js, start-manifest-plugin/manifestBuilder.js, prerender.js, post-build.js, import-protection/*, hydrate-when-transform.js and serialization-adapters-module.js (all verified). None of those host-neutral files import vite or srvx; only vite/* and rsbuild/server-middleware.js:3 (`srvx/node`) do (verified). laroux-start resolves the package.json and imports those files by file URL, with no copied code. The compat ledger asserts each path and export at every pin bump, and vendoring is the fallback if the layout breaks. Honest sizes for the vendoring option: 10,243 host-neutral src lines (.ts files outside vite/ and rsbuild/) and 5,509 lines of Rsbuild host src (both counted with wc on the 1.171.53 tarball, verified).

6. **Defines follow Start's planning.** TSS_SHELL is defined only for serve, and NODE_ENV only for build with staticNodeEnv (src/vite/planning.ts, verified). TSS_PRERENDERING is never defined, because createStartHandler.ts:190 reads it once at module top level (verified). Prerender runs in a worker started with TSS_PRERENDERING=true. That worker calls start-plugin-core's host-neutral prerender({ startConfig, handler }) and postBuild({ startConfig, adapter }) (both contracts verified in the .d.ts files), and is handed the TSS_PRERENDABLE_PATHS list that the router plugin set on the build process's globalThis (prerender.js:16 and prerender-routes-plugin.js:11, verified).

7. **.env loading.** The core env plugin loads .env files in Vite's order into the build's process.env, as Start's load-env-plugin does with prefix '' (verified). It defines import.meta.env MODE, DEV, PROD, SSR and BASE_URL, and only prefixed variables go to the client.

8. **CSRF in Start.** Start applies defaultCsrfMiddleware only when there is no start instance (createStartHandler.ts:704-708, verified). laroux-server therefore runs an Origin/Sec-Fetch-Site guard on the server-function base path for every Start app. On top of that, the build warns when src/start.ts sets requestMiddleware without createCsrfMiddleware.

9. **The /_rsc finding is reframed.** The action id comes only from the RSC-Action header, and no CORS headers are sent. A cross-site form cannot set that header, so the problem is not CSRF. It is an authorization and attack-surface hole: any HTTP client can call any exported function under dist/server. The interim fix stays urgent. CSRF matters in the new design's header-less no-JS decodeAction path, and that is where the guard sits.

10. **Version skew.**
    - Action ids are SHA-256 of the relative path plus the export name, unsalted.
    - Bound-argument encryption needs LAROUX_ACTIONS_SECRET in production. Without it there is a startup warning and a per-build key.
    - Every Flight and action response carries x-laroux-build. On a mismatch, or on a failed lazy chunk load, the client does a hard navigation.
    - `laroux build --keep-assets <n>` keeps hashed client assets from earlier builds.

11. **Flight gets its own URL.** Flight lives at `<path>/_.rsc` (plugin-rsc's convention) instead of content negotiation on the page URL, with Vary: Accept kept as a backstop. A segment that has both page and route.ts is a build error. No-JS form POSTs go to the page URL, and JS action calls go to `_.rsc` with x-rsc-action.

12. **Modulepreload during SSR.** The SSR-side reference loader calls ReactDOM.preloadModule for each client reference it resolves and for its transitive static imports, so hydration does not waterfall. Whether those links flush mid-stream is checked in S1.

13. **Production install weight, stated honestly.** A Start app's node_modules always holds Babel, Lightning CSS and srvx, because react-start depends on start-plugin-core, which depends on @babel/core, lightningcss and srvx (verified). The production artifact is free of them only because dist/server is fully bundled.

14. **Deploy targets.** Today's contract is Node only. Cloudflare and Netlify Start deploys run through Vite plugins (taken from the critique, unverified), and the repo ships a cf-workers-app recipe (.eser/recipes.json:144). A workerd target is an owner question and spike S12.

15. **Versioning.** decision-29 fixes only 5.0.0. Track L lands after 5.0.0, and all 47 packages share one version, so the design ships additively in 5.x minors: new packages, new subpath exports, the old pipeline deprecated. The old pipeline is deleted in the next repo-wide major. An owner question covers the alternatives.

16. **ADR 0003 is superseded.** docs/adr/0003-ssr-react-key-handling-strategy.md (status Accepted, line 5) describes preprocessTree in the SSR renderer this design deletes. ADR 0007 marks it Superseded.

17. **Where the tooling lives.** The compat-ledger generator is a scanner, so under decision-22 (Go owns validators and release tooling) and decision-32 it moves to Go codebasefx on the M0-T16 lexer. The conformance harness is an owner question.

18. **Dev worker details.** The worker swap specifies a drain timeout, SSE and stream cutoff, and abort and backpressure across the MessagePort. In phase 1, app WebSockets are not proxied across the worker boundary and get a clear dev error.

**How each goal is met.**
- **No Nitro, no Hono.** Start's server entry is a plain `{ fetch }`, and laroux-server takes Nitro's place. srvx is present only as a transitive dependency of start-plugin-core, and laroux never calls it.
- **No Vite, no webpack.** Neither package appears in the lockfile, enforced by a gate. plugin-rsc's /transforms and React's Flight runtime builds are vendored under MIT.
- **Rolldown only.** Every environment is a rolldown() call.
- **RSC and server actions.** laroux apps get React's own Flight with real "use server". Start apps get createServerFn, because TanStack does not support "use server" (TanStack blog, 2026-04-13, unverified today). Start RSC is phase 2, behind spikes.

Nothing was built or run beyond reading tarballs and npm metadata in the scratchpad. Local Node is v26.5.1, below the 26.9 floor. Line estimates for laroux's own code remain unmeasured until S1 and S5.

## Components

### @eserstack/bundler (rolldown environment host and core plugins) (reshaped, TypeScript)

The shared build core.

Host:
- Named environments. Each is one rolldown() call with platform, resolve.conditionNames, transform.define, transform.jsx, external/noExternal, input, outDir and codeSplitting.
- Server-consumer environments (ssr, rsc and adapter providers) default to noExternal: true. The output is self-contained and holds one React per graph. An explicit `serverExternalPackages` allow-list is checked: the build fails if a listed package lists react in dependencies or peerDependencies.
- One plugin instance per environment set, with this.environment in hook contexts.
- Raw rolldown/Rollup plugins pass through with hook filters and sourcemap chaining.
- A fixed extra-hook list recorded in ADR 0006: enforce, applyToEnvironment, config, configEnvironment, configResolved, buildApp, configureDevServer (fetch-style) and hotUpdate. A hook is added only by ADR amendment.
- An AppBuilder runs builds in adapter order, including write:false scan passes, with shared state.
- A per-environment EnvironmentManifest built in generateBundle. It carries entries, chunks with file, imports, dynamicImports, css, assets and moduleIds, and byModuleId.

The host does not fill chunk.viteMetadata. Adapters that need Start's shape normalize the EnvironmentManifest themselves.

Core plugins (rolldown has no built-in CSS):
- Lightning CSS, CSS Modules as JS, and Tailwind v4 through @tailwindcss/node plus oxide. CSS is emitted per chunk and recorded in the manifest.
- Assets: ?url, ?raw, ?inline, new URL(..., import.meta.url) and the public dir.
- Fonts.
- sharp images as an optional peer.
- An env plugin: loads .env, .env.local, .env.[mode] and .env.[mode].local into the build process's process.env (what Start's load-env-plugin does with prefix ''). It defines import.meta.env.{MODE, DEV, PROD, SSR, BASE_URL} per environment, and exposes only envPrefix variables (default 'VITE_' for Start apps, 'PUBLIC_' for laroux apps) to client environments. It never replaces process.env.* except for names an adapter lists explicitly.

The new API ships additively as the subpath ./host in 5.x. The existing backend API stays deprecated until the next repo-wide major.

Interfaces:

- createHost(config: HostConfig): Host; host.build(): Promise<AppBuildResult>; host.environments: ReadonlyMap<string, ResolvedEnvironment>
- EnvironmentConfig { name; consumer: 'client'|'server'; platform: 'browser'|'node'|'neutral'; resolve: { conditionNames; alias }; noExternal: true | (string|RegExp)[]; serverExternalPackages?: string[]; define; jsx; input; output: { dir; entryFileNames; chunkFileNames; codeSplitting } }
- HostPlugin = rolldown.Plugin & { enforce?; applyToEnvironment?(env); config?(cfg, { command, mode }); configEnvironment?(name, env); configResolved?(cfg); buildApp?(builder: AppBuilder); configureDevServer?(server: DevServer); hotUpdate?(ctx) }
- AppBuilder { build(envName, { write?: boolean }): Promise<OutputBundle>; manifest(envName): EnvironmentManifest; shared: Map<string, unknown> }
- EnvironmentManifest { entries; chunks: Map<file, { file; isEntry; imports; dynamicImports; css; assets; moduleIds }>; byModuleId }
- Sub-exports: ./host, ./plugins/css, ./plugins/assets, ./plugins/env, ./plugins/fonts, ./plugins/images, ./manifest, ./build-id

From today: A rewrite of backends/rolldown.ts (832 LOC), shipped beside it as ./host until the major.
- Today platform is never passed (rolldown.ts:204-211), so server bundles resolve browser builds.
- transform.define replaces the regex define plugin (:110-163).
- codeSplitting replaces advancedChunks.
- Raw plugins replace the esbuild-shaped onResolve/onLoad adapter (:333-447).

Plugin bodies kept: build-id.ts, css/tailwind-plugin.ts:217-340, css/modules.ts and css/fonts.ts. laroux-bundler/adapters/{lightningcss,sharp,fonts} move in.

Deleted at the major: deno-bundler.ts (TASK-182 removes it earlier), aot-snapshot, module-map, the old chunk-manifest and the unused watch() (:257-298).

### @eserstack/laroux-rsc (React Server Components and server actions on rolldown) (new, TypeScript)

RSC for any adapter on the host, with no vite or webpack package installed.

**Vendored Flight runtime.** vendor/react-server-dom holds the unmodified runtime builds of react-server-dom-webpack at the pinned React version:
- cjs server.node, server.edge, client.node, client.edge and client.browser, development and production
- LICENSE and package.json

The webpack plugin, node-register and node-loader files are not vendored. These builds require only react, react-dom and Node builtins (async_hooks, crypto, stream, util; verified in the copy plugin-rsc 0.5.38 vendors).

A refresh script fetches the npm tarball, checks its integrity hash against the registry, copies the files and records the version in vendor/VERSION. A scheduled CI job (network, like go-vuln) fails when npm has a newer react-server-dom-webpack than the vendored copy, so security patches are not missed.

**Plugins.**
- Declares three environments, all fully bundled (noExternal: true):
  - rsc: react-server and node conditions
  - ssr: node
  - client: browser
  Each also gets a scan pass.
- Per-environment transform.define renames the free identifiers `__webpack_require__` and `__webpack_chunk_load__` in the vendored runtime: `__laroux_rsc_require__` in rsc, `__laroux_ssr_require__` in ssr, `__laroux_client_require__` in client. The rsc and ssr graphs can then share one process without sharing a global. Each entry installs its own loader under its own name.
- Directive transforms:
  1. A hook filter on /use (client|server)/.
  2. TS/JSX is lowered first with rolldown/utils transformSync, using the environment's jsx options (and React Refresh in client dev phase 2). The hook returns moduleType 'js' with a chained sourcemap, so rolldown does not transform the file again.
  3. Parse with parseAst.
  4. Run the vendored plugin-rsc /transforms: hasDirective, transformDirectiveProxyExport, transformServerActionServer, transformHoistInlineDirective and scanModuleExports, MIT, with attribution.
- Because the server graphs are fully bundled, third-party 'use client' packages go through the same transforms. Nothing third-party stays external in rsc unless it is allow-listed, and allow-listed packages cannot depend on react.
- In rsc: registerClientReference proxies and registerServerReference. In client and ssr: createServerReference stubs, with .bind support.
- Inline closures are hoisted, and bound arguments are encrypted with AES-GCM through WebCrypto.
- Every client reference becomes its own lazy client chunk.
- Emits the client-reference, server-reference and SSR consumer manifests, plus an assets manifest: CSS per reference and the transitive JS chunks of each reference, used for preloads.
- Checks server-only and client-only imports.

**Ids and skew.**
- Reference and action ids are SHA-256 of the root-relative path plus the export name, with no build salt. They stay stable across deploys while the code location stays the same.
- The encryption key comes from LAROUX_ACTIONS_SECRET. In production, a missing key logs a startup warning and falls back to a per-build key, and the docs require the variable for rolling or multi-instance deploys.
- Every Flight and action response sets x-laroux-build. The browser runtime compares it with its own build id, and on a mismatch or a failed chunk import it does a hard navigation to the current URL.

**SSR preloads.** The ssr-side loader calls ReactDOM.preloadModule for each client reference it resolves and for that reference's transitive static chunks, and ReactDOM.preinit for its CSS. React then emits modulepreload links during streaming.

**Runtime.**
- Flight is inlined into the HTML stream, escaped.
- Hydration reads the inline Flight.
- The action request guard.

**Start RSC compatibility (phase 2).** The plugin answers import.meta.viteRsc.loadModule, loadCss and loadBootstrapScriptContent. resolve.alias maps @vitejs/plugin-rsc/{rsc,ssr,browser} and virtual:vite-rsc/* to laroux-rsc entries with the same export names. Names come from the compat ledger.

Interfaces:

- rsc(options: { entries: { rsc, ssr, browser }; encryptionKey?: () => Promise<Uint8Array>; actions?: { allowedOrigins?: string[]; maxBodyBytes?: number }; flightPathSuffix?: '_.rsc' }): HostPlugin[]
- @eserstack/laroux-rsc/rsc: renderToReadableStream, decodeReply, decodeAction, decodeFormState, loadServerAction (manifest-only), registerServerReference, createTemporaryReferenceSet, encryptActionBoundArgs, decryptActionBoundArgs
- @eserstack/laroux-rsc/ssr: createFromReadableStream, createServerConsumerManifest, injectFlightIntoHtml(htmlStream, flightStream), preloadReference(id)
- @eserstack/laroux-rsc/browser: createFromFetch, createFromReadableStream, encodeReply, setServerCallback, createServerReference, readInlineFlight(), onBuildMismatch(cb)
- @eserstack/laroux-rsc/actions: guardActionRequest(request, policy): Response | undefined (Origin must equal Host or be in the allow-list; Sec-Fetch-Site cross-site rejected; a non-GET request with neither header rejected; body capped)
- Virtual modules: virtual:laroux-rsc/client-references, /server-references, /assets-manifest, /encryption-key; plus the compat names virtual:vite-rsc/* in Start RSC mode
- Compile-time: import.meta.laroux.loadModule(env, entry), import.meta.laroux.loadCss()
- vendor/react-server-dom (unmodified react-server-dom-webpack runtime builds) plus scripts/refresh-vendor.ts

From today: New code. It replaces:
- laroux-react/protocol.ts (the J/M/E/P/S dialect, :9-17) and client.ts (1,493 LOC)
- laroux-server/adapters/react/{rsc-flight-renderer, which calls type(props) outside React at :430-469; ssr-renderer, with placeholder divs at :160-192; inline-rsc-emitter; rsc-handler}
- laroux-bundler/adapters/react/* and domain/{server-action-transform, client-action-stub}

laroux stops using codebase/directive-analysis.ts.

react and react-dom are pinned to an exact version (19.3.1; the lockfile is at 19.3.0, pnpm-lock.yaml:2528). react-server-dom-webpack is not a dependency, which removes its required webpack peer and its neo-async, acorn-loose and webpack-sources dependencies.

The intents of TASK-9, 12, 13, 81 and 82 become acceptance criteria.

### @eserstack/laroux-start (TanStack Start adapter) (new, TypeScript)

tanstackStart() returns a FrameworkAdapter, making laroux a third Start host.

**How it gets Start internals (default).** It imports the host-neutral modules of the installed @tanstack/start-plugin-core by file URL. It resolves `@tanstack/start-plugin-core/package.json`, which is exported, and imports dist/esm/start-compiler/host.js (createStartCompiler, mergeServerFnsById), start-compiler/server-fn-resolver-module.js, start-manifest-plugin/manifestBuilder.js (buildStartManifest, serializeStartManifest), import-protection/*, hydrate-when-transform.js, serialization-adapters-module.js, planning.js, prerender.js and post-build.js.

react-start pins start-plugin-core exactly (1.171.53 for react-start 1.169.2, verified), so the installed copy always matches. None of these files import vite or srvx (verified). The compat ledger asserts every imported path and export at each pin bump. If upstream changes the layout, the fallback is vendoring at the same commit (about 10.2k src lines).

**Environments.**
- client: browser.
- ssr: node, fully bundled.
- A provider environment: rsc in RSC mode.

**Virtual modules.** virtual:tanstack-start-client-entry and -server-entry, #tanstack-start-entry, #tanstack-router-entry, #tanstack-start-plugin-adapters, #tanstack-start-server-fn-resolver and tanstack-start-manifest:v. When user files are missing, the default entries come from @tanstack/react-start's default-entry.

**Defines, following src/vite/planning.ts.**
- Always: TSS_SERVER_FN_BASE, TSS_ROUTER_BASEPATH, TSS_DEV_SERVER ('true' only in phase 2 dev), TSS_DEV_SSR_STYLES_ENABLED, TSS_DEV_SSR_STYLES_BASEPATH, TSS_INLINE_CSS_ENABLED and TSS_DISABLE_CSRF_MIDDLEWARE_WARNING.
- TSS_SHELL only in serve, meaning phase 2 dev.
- process.env.NODE_ENV only for build with staticNodeEnv.
- Never TSS_PRERENDERING. createStartHandler.ts:190 reads it at module load, so it is set at run time by the prerender worker.

**Compiler and transforms.**
- createStartCompiler({ env, root, resolveId, loadModule }) per environment, backed by this.resolve and this.load. '?tss-serverfn-split' provider modules are loaded as separate ids.
- The hydrate-when transform is wired into the client and ssr transforms, as both upstream hosts do.
- The serialization-adapters virtual module.
- The router generator and code splitter through unplugin 3.4.0 createRolldownPlugin around router-plugin's root-exported factories (spike S4).

**Manifest.** A laroux normalizer turns the client EnvironmentManifest into NormalizedClientBuild:
- fileName, isEntry, imports, dynamicImports and css come from the manifest.
- routeFilePaths come from chunk moduleIds carrying the tsrSplit query.
- hydrationIds come from moduleIds carrying the tssHydrate marker, mirroring vite/start-manifest-plugin/normalized-client-build.js.
- cssContentByFileName is filled when inline CSS is on.

buildStartManifest is then called on the result. Transitive preloads are tested specifically (#8511, #8548).

**Build order.** client, then ssr, then provider, with serverFnsById merged in AppBuilder.shared before the resolver is generated.

**Post-build in a worker.** postBuild({ startConfig, adapter }) and prerender({ startConfig, handler }) run inside a worker_threads Worker started with env { ...process.env, TSS_PRERENDERING: 'true' }. The worker imports dist/server/entry.js only after that env is in place, and handler.request calls entry.fetch(new Request(origin + path)). The main process passes globalThis.TSS_PRERENDABLE_PATHS (set by the router plugin's prerender-routes generator plugin during the build) into the worker as workerData. The sitemap is written through post-build's buildSitemap.

**CSRF.**
- laroux-start hands laroux-server the server-function base path, and laroux-server applies guardActionRequest on that prefix for every Start app, whatever start.ts says.
- At build time, laroux-start parses src/start.ts. If it sets requestMiddleware and createCsrfMiddleware is not among the identifiers it imports and uses, the build prints a warning naming createStartHandler.ts:704-708.
- The policy is an owner question.

**Dev.**
- Phase 1: /_serverFn/* is routed ahead of any fallback to the worker's fetch.
- Phase 2: /@tanstack-start/styles.css?routes= and lazy server-function ids.

**Not supported.** Vite plugins. A documented equivalents table covers @tailwindcss/vite (use larouxCss), vite-tsconfig-paths (rolldown tsconfig) and svgr (an asset plugin).

Interfaces:

- tanstackStart(options?: TanStackStartInputConfig & { rsc?: { enabled: boolean }; csrf?: 'enforce' | 'warn' }): FrameworkAdapter
- internals.ts: resolveStartCore(): { compilerHost, manifestBuilder, resolverModule, importProtection, hydrateWhen, serializationAdapters, prerender, postBuild }, with paths asserted against compat-ledger.json
- normalizeClientBuild(manifest: EnvironmentManifest, opts: { inlineCss }): NormalizedClientBuild
- AppBuilder order without RSC: client, ssr, provider; with RSC decided by spike S8
- Output: dist/client/**; dist/server/index.js (one bundle holding laroux-server/serve, Start's { fetch } and the app); dist/rsc/** in RSC mode
- Pinned set, bumped together: @tanstack/react-start 1.169.2 (which pins start-plugin-core 1.171.53 and start-server-core 1.169.43), @tanstack/router-plugin 1.168.46, unplugin 3.4.0

From today: New. The models are start-plugin-core's src/rsbuild host (5,509 src lines, verified) and src/vite (planning.ts, start-manifest-plugin/normalized-client-build.ts and dev-server-plugin).

With file-path imports, laroux maintains its host code only. With the vendor fallback it would also maintain about 10,243 src lines (verified count).

laroux's own size is unmeasured until spike S5.

### @eserstack/laroux-server (lean fetch host, bundled into dist/server/index.js) (reshaped, TypeScript)

A framework-neutral production server on runtime.http. Its ./serve entry is bundled into each app's dist/server/index.js, so production does not need the package installed. The ./serve module graph contains no React, rolldown, Tailwind, sharp or Babel.

Pipeline:
1. /_laroux/health.
2. The rate limiter, keyed on the peer address. Forwarded headers count only from trustProxy CIDRs.
3. Optional guarded prefixes. For Start: the server-function base, with the Origin/Sec-Fetch-Site guard on every method.
4. Static dist/client: a streamed file handle, ETag with 304/412, a single Range (206/416), precompressed .br/.gz preferred, 'max-age=31536000, immutable' for hashed files and no-cache otherwise. Path containment and the deny list are kept.
5. Optional public/.
6. The adapter's fetch(request, ctx).

The response then goes through:
- Compression: node:zlib br or gzip with flush() after every chunk, Vary: Accept-Encoding, and skipping event streams, bodies already encoded and bodies under 1 KiB.
- Vary: Accept, added to responses of routes that serve both HTML and Flight, as a backstop for older clients.
- Security headers last. Upgrade responses pass through as the same object.

On shutdown: close, closeIdleConnections, a timeout, then closeAllConnections.

It also serves dist/client/_prev/<buildId>/**, written by `laroux build --keep-assets <n>`, so pages from earlier builds can still load their chunks.

Interfaces:

- serve(options: { handler: FetchHandler; clientDir; publicDir?; immutable?: (path) => boolean; guardedPrefixes?: { prefix: string; policy: ActionPolicy }[]; host; port; unixSocket?; trustProxy?: CidrList; compression?: false | { encodings: ('br'|'gzip')[] }; rateLimit?; securityHeaders?; shutdownTimeoutMs; signal? }): Promise<{ addr; stop(): Promise<void> }>
- FetchHandler = (request: Request, ctx: { remoteAddr: string; signal: AbortSignal; waitUntil(p: Promise<unknown>): void }) => Response | Promise<Response>
- ./serve (bundled into output), ./static, ./compression, ./security-headers
- dist/server/index.js imports the app entry and calls serve({ handler: entry.fetch, clientDir: new URL('../client', import.meta.url) })

From today: Kept from runtime/server.ts: path-containment.ts, the deny list (:202-225), SECURITY_HEADERS (:142-148) and the rate-limiter wiring. X-XSS-Protection is dropped.

Replaced: the whole-file readFile static path (:254, :310) and the blanket no-cache (:139).

Removed at the major: the Deno.* calls (:350, :373, :860), the createHandler ladder (:336-680), handlePageRequest (:685-848), main.ts and ensureBuildIsReady (:299-312), ServerModules with ?v= imports, build-module.ts, PrebuiltBundler, the unused renderer/htmlShell ports (options.ts:42-46), adapters/react/* and action-registry.ts.

The CLI and dev pieces move to laroux-dev. During 5.x, laroux-server's bin forwards to laroux-dev's.

### @eserstack/laroux-dev (dev server and the `laroux` CLI) (new, TypeScript)

The `laroux` bin, with init, dev, build, serve and preview, also mounted as `eser laroux`. It loads laroux.config.ts through Node 26 type stripping and drives the host through the adapter. `build --keep-assets <n>` copies the previous builds' hashed client files into dist/client/_prev.

**Phase 1 (stable APIs only).**
- Every environment builds in development mode: sourcemaps, no minify, command 'build'.
- For Start this gives TSS_DEV_SERVER false with NODE_ENV development. Start never ships that combination itself, because it only ever pairs serve with dev or build with prod (planning.ts). S5 must check the behaviors it touches: the cached base manifest (createStartHandler.ts:119-123), early hints (:124), the CSRF warning (:787) and React dev builds. If any of them breaks, phase-1 Start dev builds with NODE_ENV production plus sourcemaps instead.
- Rebuilds use rolldown watch where S6 confirms that incremental, multi-environment builds with shared plugin state are correct. Otherwise every environment is rebuilt.

**Server runner.** The server entry runs in a disposable worker_threads worker:
- Each Request is forwarded with a request id over a MessagePort, transferring the body ReadableStream.
- The main thread's request.signal abort becomes an 'abort' message that aborts the worker-side AbortController. Response-body cancel and backpressure are relayed the same way (S6 verifies both).
- On rebuild, a new worker starts and signals ready. New requests switch to it, and the old worker gets drainTimeoutMs (default 10 s) for in-flight requests. After that its remaining streams, including SSE, are aborted and the worker is terminated. EventSource clients reconnect.
- App WebSocket upgrades are not forwarded across the worker boundary in phase 1: an open net.Socket cannot be transferred to worker_threads. They get a 501 dev response with an explanatory body. Phase 2's in-thread ModuleRunner can lift this.

**HMR channel.**
- full-reload and css-update go over /__laroux/hmr.
- The upgrade Response is returned unwrapped.
- 'connected' is sent from the socket's open event.

**Errors.** A build error shows an overlay page while the last good worker keeps serving.

**Phase 2 (after spikes S6 and S7).**
- A ModuleRunner for the server environments.
- DevEngine full-bundle mode for the client, with a DevRuntime subclass implementing the import.meta.hot subset.
- React Fast Refresh, done by the laroux-rsc pre-transform or transform.jsx.refresh.
- RSC updates sent as rsc:update.
- Start's TSS_DEV_SERVER switched on, with the styles endpoint and lazy server-function ids.
- rolldown pinned with ~.

Interfaces:

- CLI: laroux init | dev | build [--keep-assets n] | serve | preview [--host --port --mode]
- createDevServer({ host: Host; port; hostname; drainTimeoutMs? }): Promise<DevServer>
- DevServer { use(mw: (request: Request, next: () => Promise<Response>) => Promise<Response>); hot: HotChannel; environments: { [name]: { fetch(request): Promise<Response>; invalidate(ids): void } }; restart(); close() }
- Worker protocol: { type: 'request', id, method, url, headers, body: ReadableStream } / { type: 'abort', id } / { type: 'response', id, status, headers, body: ReadableStream } / { type: 'ready' | 'drained' }
- HotChannel { send(payload: { type: 'full-reload' | 'css-update' | 'update' | 'rsc:update' | 'error' | 'custom' }); on(event, cb) }

From today: Takes over laroux-server's module.ts:52-167, commands/{init,dev,build,serve}.ts, bin-main.ts, hmr-manager.ts and rebuild-handler.ts. The hardwired Tailwind, global.css and sharp (dev.ts:78-106, serve.ts:91) become config.

It replaces system.watch (system.ts:1004-1170) and the ?v= re-import (build-module.ts:28-51).

Browser HMR is probably inert today: hmrEnabled is false at system.ts:1258 and PrebuiltBundler is always used (main.ts:308-311). This was read from the code, not run.

### @eserstack/laroux (contracts, config and framework-neutral helpers) (reshaped, TypeScript)

Holds the FrameworkAdapter port and the deploy target contract.

defineConfig covers framework, target, server, build, css, env, fonts and images. config.server.host is honoured.

The only target today is 'node': dist/client plus a self-contained dist/server/index.js. The FrameworkAdapter exposes its fetch entry separately, so a future 'workerd' target can wrap the same entry with a platform 'neutral' build (workerd/worker conditions and the vendored Flight runtime's edge builds) and no Vite plugin. That target is decided by an owner question and spike S12.

Also here: the router matcher, page-request parsing, navigation, image helpers and the ApiHandler/HttpError types.

Interfaces:

- defineConfig(config: UserConfig): UserConfig; UserConfig { framework?: FrameworkAdapter; target?: 'node'; plugins?: HostPlugin[]; server: { host; port; trustProxy }; build: { minify; sourcemap; outDir; keepAssets?; serverExternalPackages? }; env?: { prefix?: string }; css; fonts; images }
- FrameworkAdapter { name; plugins(ctx): HostPlugin[]; environments(ctx): EnvironmentConfig[]; buildApp(builder: AppBuilder): Promise<void>; fetchEntry: string; clientDir: string; guardedPrefixes?(): { prefix; policy }[]; devMiddleware?(server: DevServer): void; postBuild?(ctx): Promise<void> }
- ./router (matcher, page-request, api-types), ./navigation, ./image, ./config

From today: router/, navigation/ and image/ are kept.

config/types.ts (410 LOC) and defaults.ts are trimmed: ssr.mode, streamMode, serverExternals and browserShims are removed. During 5.x they are deprecated, not removed, and each has a Migration entry.

build becomes a field that is actually read. Today build.minify is set at commands/build.ts:195-198 but BuildConfig has no such field (laroux-bundler/types.ts:41-75).

### @eserstack/laroux-react (laroux-native runtime and components) (reshaped, TypeScript)

The React side of the laroux framework, on laroux-rsc.

entry.rsc is the rsc environment's { fetch }. It:
1. Strips a trailing `/_.rsc` and marks the request as a Flight request.
2. Matches virtual:laroux/routes.
3. Runs the proxy.ts chain.
4. Runs route.ts handlers. A segment cannot have both page and route.ts; that is a build error from laroux-bundler. So a POST to a page URL is never ambiguous.
5. On a POST to `<path>/_.rsc` with x-rsc-action: guardActionRequest, decodeReply with temporaryReferences, loadServerAction from the manifest, the call, then one Flight stream { root, returnValue, formState }.
6. On a POST to a page URL without the header (a no-JS form): guardActionRequest (this is the path where CSRF is real), decodeAction, decodeFormState, then a full HTML render.
7. On a GET to `<path>/_.rsc`: returns Flight with Cache-Control private, no-cache.
8. On a document GET: nested layouts plus the page, rendered to HTML through entry.ssr.

Every Flight response carries x-laroux-build.

entry.ssr: createFromReadableStream with the ssr loader. The loader preloads modules for each resolved reference. Then react-dom/server, CSS from the assets manifest, fonts, and inline Flight.

entry.browser:
- hydrateRoot from inline Flight.
- setServerCallback, which posts to `<path>/_.rsc`.
- Link navigation through createFromFetch(`<path>/_.rsc`) in startTransition.
- A hard navigation on a build-id mismatch or a failed chunk import.

Components: Link, useRouter, Image, ResponsiveImage, SpanRenderer and useFunction (to re-check under react-server). Library code stays .ts with createElement (decision-17).

Interfaces:

- @eserstack/laroux-react/entry.rsc (default { fetch(request, ctx) }), /entry.ssr (renderHtml(flight, opts)), /entry.browser
- Wire: GET <path>/_.rsc -> text/x-component; POST <path>/_.rsc with x-rsc-action: <sha256 id>, body from encodeReply; POST <path> (no-JS form) -> HTML; every Flight response carries x-laroux-build
- Link, useRouter, Image, ResponsiveImage, SpanRenderer, useFunction

From today: Kept: runtime/navigation, runtime/image, span-renderer, use-function and PageRequest.

Deleted at the major (deprecated during 5.x): protocol.ts, client.ts and client/bootstrap/* (entry.tsx is 835 LOC).

Added: route-dispatcher, middleware-dispatcher, render-app and html-shell from laroux-server, rewritten as the entries. Nested layouts are fixed; today server-modules.ts:141-145 renders only the root layout.

The new entries ship as new subpaths in 5.x, so existing apps keep working until the major.

### @eserstack/laroux-bundler (laroux-native framework adapter) (reshaped, TypeScript)

laroux() returns the FrameworkAdapter. It:
- Scans src/app/routes and serves the result as virtual modules (virtual:laroux/routes, virtual:laroux/api-routes, virtual:laroux/proxy).
- Fails the build when a segment has both page and route.ts.
- Regenerates routes on add or remove.
- Wires rsc() and the core plugins.
- Extracts critical and universal CSS.
- Takes the global stylesheet path from config.
- Sets the build order: rsc scan, rsc, client, ssr, then finalize.

Finalize produces precompressed copies, dist/server/index.js (bundling laroux-server/serve with entry.rsc and entry.ssr) and dist/.laroux/build.json.

Interfaces:

- laroux(options?: { appDir?: 'src/app'; globalCss?: string; criticalCss?: boolean }): FrameworkAdapter
- virtual:laroux/routes (pages with nested layout chains, not-found, error), virtual:laroux/api-routes, virtual:laroux/proxy

From today: Kept: domain/route-scanner.ts, the route-generator logic (which now emits the virtual module source) and the critical/universal CSS code.

Deleted at the major:
- system.ts (2,285 LOC; pipeline at :226-808)
- virtual-source, import-map and import-map-resolver-plugin
- server-externals-plugin, build-cache, build-validator and chunk-manifest
- adapters/react, runtime-bundler and prebuilt-bundler
- the FrameworkPlugin port (framework-plugin.ts:61-140)
- the regex .module.css.json rewrites

In 5.x laroux() is a new export next to the old pipeline.

### @eserstack/standards runtime.http (Node adapter) (reshaped, TypeScript)

The HTTP facade under laroux-server and laroux-dev (decision-16). It gains:
- handler info { remoteAddr, signal }
- graceful drain with a timeout
- headers, request and keep-alive timeouts
- an optional unix socket
- opt-in trustProxy for request.url
- the documented upgrade identity rule

Interfaces:

- HttpHandler = (request: Request, info: { remoteAddr: string; signal: AbortSignal }) => Response | Promise<Response>
- ServeOptions { port; hostname; unixSocket?; signal?; headersTimeoutMs?; requestTimeoutMs?; keepAliveTimeoutMs?; shutdownTimeoutMs?; trustProxy?; onListen? }
- upgradeWebSocket(request) -> { socket, response }

From today: Extends adapters/node-http.ts.

Gaps today:
- types.ts:903 and :908-921: no peer address and few options.
- node-http.ts:132-135: request.url always starts with http://.
- node-http.ts:428-438: stop() is abrupt.
- node-http.ts:494: the upgrade is accepted only when the same Response object comes back.

TASK-180 covers the peer address; the rest is new scope.

### Compat ledger (Go codebasefx) and conformance harness (new, both)

**(1) Compat ledger, in Go.** decision-22 gives Go the validators and release tooling, and decision-32 ports source-inspecting validators to Go on the M0-T16 lexer. A codebasefx scanner reads the pinned dists of @tanstack/start-plugin-core, start-server-core, react-start-rsc, router-plugin and the vendored react-server-dom runtime. It lists:
- every host hook, virtual-module id, TSS_* define and process.env.TSS_* read
- every import.meta.* call, @vitejs/plugin-rsc/* import and viteMetadata access
- every dist file path and export that laroux-start imports by file URL

It writes compat-ledger.json. `--check` fails a pin-bump PR on any unlisted entry or missing path.

**(2) Conformance harness.** A fixture matrix built with `laroux build` and run with `node dist/server/index.js` from a directory with no node_modules, which proves the bundle is self-contained. Fixtures: TanStack's start-basic, a createServerFn app, start-basic with a custom src/start.ts (CSRF), a prerender fixture, start-rscs (phase 2), plugin-rsc's starter ported to laroux-native, and the laroux-app recipe.

Checks over HTTP:
- SSR
- server function GET and POST
- a cross-site server-function POST rejected
- React action round trip and no-JS form
- CSS links, modulepreloads and transitive preloads
- Vary and Cache-Control on Flight
- the build-id mismatch reload
- one React per graph

Hydration-warning checks need a headless browser. The driver language and browser tool are an owner question.

**(3) Lockfile gate.** No package named vite or webpack may appear.

**(4) Vendor freshness job.** Scheduled CI: the vendored react-server-dom version must equal the newest npm release of the pinned React minor.

Interfaces:

- eser codebase compat-ledger --check | --write (Go, codebasefx scanner on the M0-T16 lexer)
- eser codebase lockfile-forbid --names vite,webpack
- Conformance fixture job, reused by TASK-237's packed-CLI smoke job
- Scheduled CI: vendor-freshness (network, outside precommit)

From today: New. It follows the validator pattern in .eser/manifest.yml. It runs on pin bumps and in CI, not in every precommit.

### pkg/ajan (Go): kitfx init, the compat ledger, build-time asset jobs, optional httpfx edge (reshaped, Go)

Go stays off the bundler transform path, the render path and the request path. What it owns:

1. `laroux init` through kitfx in the Go eser binary, from M3.
2. The compat-ledger scanner and the lockfile gate in codebasefx, per decision-22 and decision-32.
3. M6 candidates, each with a TypeScript fallback because laroux must build with ESER_AJAN=disabled:
   - Google font fetching and caching
   - possibly route-table generation from collectorfx
   Precompression stays on node:zlib unless measured otherwise, and images stay on sharp.
4. After the ADR that decision-31 calls for, following M6: an optional httpfx edge (TLS, HTTP/3, rate limiting, static dist/client through http.ServeContent, and ReverseProxy to Node over a unix socket).

Interfaces:

- EserAjanCall('kit.clone' | 'laroux.fonts.fetch' | 'collector.walk', ...) through the TASK-238 ABI in worker threads (TASK-239)
- codebasefx: compat-ledger and lockfile-forbid validators
- Later: an httpfx edge in front of unix:/run/laroux.sock

From today: httpfx, kitfx, collectorfx and codebasefx exist. There is no FileServer, ServeContent, ReverseProxy or compression in pkg/ajan or cmd, and Result bodies are []byte (router.go:308-347). The ledger scanner and the edge are new.

### laroux custom Flight dialect, SSR pre-pass, /_rsc endpoint and copy-and-rewrite pipeline (removed, TypeScript)

Deprecated when track L ships in 5.x and deleted in the next repo-wide major. It is replaced by laroux-rsc, the host and the adapters.

The removed pieces:
- the J/M/E/P/S protocol
- the out-of-React renderer
- SSR without client-component markup
- double-render streaming
- plaintext path#export action ids
- regex directive scanning
- on-disk source copies

Interfaces:


From today: Removed from:
- laroux-react: protocol.ts and client.ts
- laroux-server: adapters/react/* and runtime/server.ts:423-565
- laroux-bundler: system.ts steps 3-11 and 22, plus domain/{server-action-transform, client-action-stub, virtual-source}

The interim fix to /_rsc lands now.

### @eserstack/laroux-runtime and @eserstack/jsx-runtime (removed, TypeScript)

Not part of the design.

Interfaces:


From today: Deleted in M1 by decision-18 (TASK-210), along with their recipes. That plan does not change.

## Request flow

Production works the same way for both frameworks: `node dist/server/index.js`. It is one self-contained bundle, so it runs with no node_modules unless the app allow-listed a native serverExternalPackage.

**Shared host steps.**
1. index.js, which bundles laroux-server/serve, calls serve({ handler: entry.fetch, clientDir, guardedPrefixes }).
2. runtime.http (node:http) listens on host:port or a unix socket, builds a WHATWG Request (duplex 'half'), and calls handler(request, { remoteAddr, signal }).
3. laroux-server runs its pipeline:
   a. /_laroux/health.
   b. Rate limiter on remoteAddr. Forwarded headers count only from trustProxy peers.
   c. Guarded prefixes. For Start, the TSS_SERVER_FN_BASE prefix runs guardActionRequest on every method: Origin must match Host or the allow-list, Sec-Fetch-Site cross-site is rejected, a non-GET with neither header is rejected, and the body is capped. This applies even when the app's src/start.ts dropped Start's default CSRF middleware (createStartHandler.ts:704-708).
   d. Static dist/client, including _prev/<buildId>/ from --keep-assets: streamed, with ETag/304, Range and precompressed variants, immutable for hashed files.
   e. public/ (laroux-native).
   f. The adapter's fetch.
4. On the way out: compression with per-chunk flush and Vary: Accept-Encoding, then security headers. Upgrades pass through as the same object.

**TanStack Start app.** fetch is Start's createStartHandler.
- /_serverFn/<sha256 id> requests go to Start's server-function handler. Start's own CSRF middleware runs too, when the app has no custom requestMiddleware. The handler uses seroval and the generated resolver.
- Every other path goes through TanStack Router: matching, loaders, streaming SSR, preloads and CSS from tanstack-start-manifest:v.
- TSS_PRERENDERING is false in production, because only the prerender worker sets it.
- With RSC on (phase 2), the provider environment is rsc. The ssr bundle reaches it through a static relative import compiled from import.meta.viteRsc.loadModule. S2 and S8 verify that this keeps module singletons, such as start-storage-context's AsyncLocalStorage, correct across the two outputs.
- No Nitro, h3 or Hono is involved. srvx is in node_modules at build time as a dependency of start-plugin-core, but it is not in the bundle and is never called.

**laroux-native app.** fetch is entry.rsc.
1. A trailing /_.rsc marks a Flight request.
2. Match against virtual:laroux/routes.
3. The proxy.ts chain.
4. route.ts. A page and a route.ts never share a segment.
5. POST <path>/_.rsc with x-rsc-action: guard, decodeReply, loadServerAction (manifest only), the call, then one Flight stream { root, returnValue, formState }. Response headers: x-laroux-build, and Cache-Control private, no-cache.
6. POST <path> without the header (a no-JS form): guard (the real CSRF surface), decodeAction, decodeFormState, then full HTML.
7. GET <path>/_.rsc: Flight. Responses that can carry either HTML or Flight also send Vary: Accept as a backstop.
8. Document GET:
   - Flight is teed into the in-process ssr bundle.
   - createFromReadableStream with the ssr loader. Each resolved client reference triggers ReactDOM.preloadModule for its chunk and its transitive static imports, plus preinit for its CSS, so modulepreload links stream with the shell.
   - react-dom/server renderToReadableStream, with the inline Flight escaped.
9. In the browser, entry.browser hydrates from inline Flight and navigates through createFromFetch(<path>/_.rsc). A build-id mismatch or a failed dynamic import triggers a hard navigation, and old chunks stay reachable under _prev when --keep-assets is used.

**Dev.** The same pipeline. In phase 1, fetch is forwarded to the current server worker. Aborts and body cancels are relayed by request id. During a swap, the old worker drains for drainTimeoutMs, and then its open streams, including SSE, are aborted. App WebSocket upgrades get 501 in phase 1. laroux-dev owns /__laroux/hmr.

**Optional later**, after M6 and an ADR: a Go httpfx edge in front of the unix socket.

## Build flow

`laroux build` (laroux-dev):

1. **Config.**
   - Import laroux.config.ts (erasable TS only).
   - The env plugin loads .env, .env.local, .env.[mode] and .env.[mode].local into the build's process.env, so Start's config and the user's config see them.
   - Pick the FrameworkAdapter, collect HostPlugins, then run config, configEnvironment and configResolved.

2. **Environments.**
   - client: browser, transform.jsx automatic, codeSplitting.
   - ssr: node, noExternal: true.
   - rsc (when RSC is on): react-server and node conditions, noExternal: true.
   - Only allow-listed serverExternalPackages stay external. The build fails if one of them depends on react.
   - laroux-rsc sets per-environment transform.define for `__webpack_require__` and `__webpack_chunk_load__` (to `__laroux_rsc_require__`, `__laroux_ssr_require__` or `__laroux_client_require__`) and resolves react-server-dom-webpack/* to its vendored copy.
   - import.meta.env is defined per environment. Client environments see only envPrefix variables.

3. **Transform order inside each environment.** Plugin transform hooks run before rolldown's built-in TS/JSX transform.
   - For files matching /use (client|server)/, laroux-rsc lowers TS/JSX with rolldown/utils transformSync (the same jsx options), runs the vendored directive transforms on parseAst output, and returns moduleType 'js' with a chained sourcemap.
   - StartCompiler parses TS through @tanstack/router-utils (Babel with the TS and JSX plugins), so it takes raw source.

4. **The adapter's buildApp.**

**laroux-native:**
- (a) **rsc scan** (write:false). Finds 'use client' modules, including those in node_modules, because the graph is fully bundled, and 'use server' references.
- (b) **rsc.** Client-reference proxies and server-reference registration with unsalted SHA-256 ids, plus the server-reference manifest.
- (c) **client.**
  - entry.browser plus one dynamic entry per client reference.
  - Server-reference stubs.
  - CSS assets.
  - generateBundle writes the EnvironmentManifest, the client-reference manifest and the assets manifest (CSS plus transitive JS per reference, for preloads).
- (d) **ssr.** Real client modules, the consumer manifest and the assets manifest as virtual modules.
- (e) **finalize.**
  - Critical and universal CSS.
  - The key strategy (LAROUX_ACTIONS_SECRET at run time, or a per-build key with a startup warning).
  - .br and .gz copies.
  - dist/server/index.js, bundling laroux-server/serve with the entries.
  - With --keep-assets n, the previous builds' hashed files copied into dist/client/_prev/<buildId>/.
  - dist/.laroux/build.json.

**TanStack Start, no RSC.** This follows src/vite/planning.ts.
- (a) **client.**
  - virtual:tanstack-start-client-entry.
  - createStartCompiler in client mode (imported by file URL from the installed start-plugin-core).
  - The hydrate-when transform.
  - The router generator and code splitter.
  - Import protection.
  - serverFnsById merged into AppBuilder.shared.
- (b) **ssr.**
  - The server entry and createStartCompiler in ssr mode.
  - '?tss-serverfn-split' provider modules.
  - The resolver from serverFnsById.
  - tanstack-start-manifest:v from laroux's normalizer: the client EnvironmentManifest becomes a NormalizedClientBuild, with routeFilePaths and hydrationIds taken from moduleIds, and is passed to buildStartManifest.
  - Defines exactly as planning.ts gives them for build: no TSS_SHELL, NODE_ENV only with staticNodeEnv, never TSS_PRERENDERING.
  - The whole graph is bundled, including laroux-server/serve, into dist/server/index.js, with Start's fetch entry also emitted as dist/server/entry.js.
- (c) **provider**, only when one is configured separately.
- (d) **post-build in a worker.**
  - Spawn a worker_threads Worker with env { ...process.env, TSS_PRERENDERING: 'true' } and workerData { startConfig, prerenderablePaths: globalThis.TSS_PRERENDABLE_PATHS }.
  - The worker sets globalThis.TSS_PRERENDABLE_PATHS, imports dist/server/entry.js, and calls start-plugin-core's postBuild({ startConfig, adapter }), whose adapter.prerender calls prerender({ startConfig, handler: { getClientOutputDirectory, request: (path, init) => entry.fetch(new Request(origin + path, init)), close } }).
  - Then the sitemap and precompression.
- The CSRF lint runs over src/start.ts and only warns.

**TanStack Start with RSC** (phase 2). The order comes from spike S8. The candidate is rsc scan, client, ssr, rsc (provider), with @vitejs/plugin-rsc/* and virtual:vite-rsc/* aliased onto laroux-rsc.

**Output:**
- dist/client/** (hashed assets, .br and .gz copies, optional _prev/)
- dist/server/index.js (self-contained)
- dist/server/entry.js (Start)
- dist/rsc/** in RSC mode
- dist/.laroux/build.json

No .ts registries, no ?v= cache busting, no source copies.

**Gates on the output:**
- The lockfile has no vite or webpack.
- The conformance harness runs `node dist/server/index.js` from a directory with no node_modules.

## Dev flow

`laroux dev` ships in two phases, because rolldown's dev APIs are experimental: DevEngine, DevRuntime, the hidden hotUpdate and moduleRunnerTransform, whose options changed in 1.2.8, 1.2.12 and 1.2.13.

**Phase 1** uses stable APIs only and ships first.

1. **Build.** Every environment builds in development mode: sourcemaps, no minify, command 'build' semantics, and the server graphs fully bundled as in production. The env plugin reloads .env files on change, which triggers a rebuild.

2. **Start specifics.**
   - TSS_DEV_SERVER is false, so server-function ids are production SHA256 ids with a static resolver.
   - NODE_ENV is development. Start never ships that pairing itself (planning.ts pairs serve with dev and build with prod), so S5 checks:
     - the cached base manifest (createStartHandler.ts:119-123), which is acceptable because the manifest is rebuilt and a new worker loads it
     - early hints (:124)
     - the missing-CSRF warning (:787)
     - React dev builds and the IS_DEV error messages (:192-199)
   - If any of them misbehaves, phase-1 Start dev uses NODE_ENV production with sourcemaps instead, and the docs say so.
   - TSS_PRERENDERING is never set in dev.

3. **HTTP.** The dev HTTP server runs on runtime.http with the same laroux-server pipeline, including the server-function guard. Adapter configureDevServer middleware is fetch-style, and laroux-start puts /_serverFn/* ahead of any fallback.

4. **Server worker.** The server entry runs in a worker_threads worker.
   - The main thread sends { type: 'request', id, method, url, headers, body } with the body ReadableStream transferred.
   - request.signal abort becomes { type: 'abort', id }, which aborts the worker-side controller.
   - The worker answers with a transferred response body. A main-thread cancel of that body is relayed back.
   - S6 verifies that abort, cancel and backpressure are correct, and measures TTFB and throughput against in-thread fetch.

5. **Watching.** watchChange and addWatchFile feed the router generator (routeTree.gen.ts) and laroux-bundler's virtual routes.
   - Incremental rolldown watch is used only if S6 shows that multi-environment rebuilds with shared plugin state (serverFnsById, reference manifests) are correct. Otherwise each change rebuilds the environment set in order.

6. **Worker swap.** After a server rebuild, a new worker starts and posts ready. New requests go to it.
   - The old worker gets drainTimeoutMs (default 10 s) for in-flight requests.
   - After that, its remaining streams (SSE, long Flight streams) are aborted and the worker is terminated. EventSource clients reconnect on their own.
   - Node's ESM cache never grows, which answers decision-31's dev-memory concern without a Go shell.

7. **WebSockets.** App WebSocket upgrades to app paths are not proxied in phase 1, because an open socket cannot be transferred to worker_threads. They get a 501 whose body explains that phase 1 dev does not support app WebSockets, and the docs say so. The HMR socket is owned by the main thread. Its upgrade Response is returned as the same object (the node-http.ts:494 check), and 'connected' is sent from the open event (fixing hmr-manager.ts:34/:90).

8. **Client changes.** Client or CSS changes send full-reload or css-update.

9. **Errors.** Build errors render an overlay while the last good worker serves.

**Phase 2**, gated by S6 and S7, is its own milestone.
- Server environments move to a ModuleRunner if it beats the worker swap on edit-to-response latency at flat RSS. Running in-thread also allows app WebSockets.
- The client environment moves to DevEngine full-bundle mode, with a DevRuntime subclass implementing import.meta.hot (accept, dispose, data, invalidate, prune, on, send).
- React Fast Refresh, added inside laroux-rsc's pre-transform for directive files and through transform.jsx.refresh for the rest.
- Start switches to TSS_DEV_SERVER true and TSS_SHELL, with /@tanstack-start/styles.css?routes= and lazy server-function ids.
- rsc:update refetches <path>/_.rsc and keeps client state.
- An unbundled, Vite-style dev server is out of scope.

`laroux preview` runs the built dist/server/index.js unchanged.

The owner decides whether phase 1 alone is acceptable as the Start dev experience in the first release; it is a separate owner question.

## TanStack Start integration

**User side.** A normal Start app: src/routes, src/router.tsx, and optional src/start.ts and src/server.ts. There is no vite.config.ts. Config: `laroux.config.ts: export default defineConfig({ framework: tanstackStart({ srcDirectory, router, server: { entry }, serverFns: { base }, csrf: 'enforce', rsc: { enabled: false } }), env: { prefix: 'VITE_' }, css: { tailwind: { entry: 'src/styles.css' } } })`.

Dependencies: @tanstack/react-start and @tanstack/react-router at exact versions, react and react-dom at exact versions, @eserstack/laroux-dev (devDependency), @eserstack/laroux-start and @eserstack/laroux-server.

**Install weight, stated honestly.** react-start 1.169.2 depends on start-plugin-core 1.171.53, which brings @babel/core, lightningcss, srvx, vitefu, zod, xmlbuilder2 and router-plugin (verified with npm view). The app's node_modules holds them in development and CI regardless of laroux. The production artifact does not, because dist/server/index.js is fully bundled and runs without node_modules.

Not installed, and enforced by the lockfile gate: vite, webpack, nitro, hono and @vitejs/plugin-rsc. A new .eser/recipes/laroux-start-app ships next to laroux-app.

**What laroux-start implements, checked against TanStack/router 6777b8b0 and start-plugin-core 1.171.53.**

1. **Environments.** client (browser), ssr (node, noExternal: true) and a provider environment.

2. **Start internals by file URL.**
   - Resolve `@tanstack/start-plugin-core/package.json`, which is in the exports map (verified).
   - Import dist/esm/start-compiler/host.js, start-compiler/server-fn-resolver-module.js, start-manifest-plugin/manifestBuilder.js, import-protection/*, hydrate-when-transform.js, serialization-adapters-module.js, planning.js, prerender.js and post-build.js (per-module files verified).
   - react-start pins start-plugin-core exactly, so there is no copy drift. None of those files import vite or srvx; only vite/* and rsbuild/server-middleware.js:3 do (verified).
   - The ledger asserts every path and export at each bump. The fallback is vendoring at the same commit, about 10,243 src lines (verified count).
   - An upstream discussion (S11) asks for host-neutral exports so this becomes a normal import.

3. **Virtual modules.** Every id in constants and start-server-core's virtual-modules, with default entries from @tanstack/react-start's default-entry.

4. **Defines, matching src/vite/planning.ts for the build command (verified).**
   - TSS_SERVER_FN_BASE, TSS_ROUTER_BASEPATH, TSS_DEV_SERVER ('false' in build and phase 1), TSS_DEV_SSR_STYLES_ENABLED, TSS_DEV_SSR_STYLES_BASEPATH, TSS_INLINE_CSS_ENABLED and TSS_DISABLE_CSRF_MIDDLEWARE_WARNING.
   - TSS_SHELL only for serve (phase 2 dev).
   - process.env.NODE_ENV only for build with staticNodeEnv.
   - TSS_PRERENDERING is never defined. createStartHandler.ts:190 reads it at module load (verified), so it is set at run time by the prerender worker.
   - Issue #8201 shows what breaks when a define is missing (unverified today).

5. **Environment variables.** The core env plugin does what Start's load-env-plugin does: it loads every variable from the .env files into the build's process.env at configResolved time (verified: loadEnv with prefix ''). It also gives the client import.meta.env.VITE_* plus MODE, DEV, PROD, SSR and BASE_URL.

6. **Compiler.** createStartCompiler({ env, root, resolveId: this.resolve, loadModule: this.load }) in client and ssr transform hooks, with '?tss-serverfn-split' loaded as separate ids, the hydrate-when transform in both, import protection, and the serialization-adapters module. rsbuild/start-compiler-host.ts is the template.

7. **Router plugins.** createRolldownPlugin around unpluginRouterGeneratorFactory and unpluginRouterCodeSplitterFactory, from router-plugin's root export. The code splitter's Vite-only options are emulated with applyToEnvironment. globalThis.TSS_ROUTES_MANIFEST and TSS_PRERENDABLE_PATHS are shared within the build process.

8. **Build order.** client, then ssr, then provider, with serverFnsById merged (mergeServerFnsById) before the resolver is generated.

9. **Manifest.** laroux's normalizer turns the client EnvironmentManifest into NormalizedClientBuild: fileName, isEntry, direct imports, dynamicImports, css, routeFilePaths from tsrSplit moduleIds, hydrationIds from tssHydrate moduleIds, and cssContentByFileName when inline CSS is on (types.d.ts:83-101, verified). It is then passed to buildStartManifest. The core host does not need viteMetadata. The NormalizedClientChunk doc comment says rolldown reports direct imports only and consumers must walk the graph, so transitive preloads are asserted in conformance (#8511, #8548).

10. **Prerender and sitemap.** These run in a worker with TSS_PRERENDERING=true set before entry.js is imported, using start-plugin-core's own postBuild and prerender with laroux's StartPostBuildAdapter and PrerenderHandler (contracts verified in the .d.ts files). TSS_PRERENDABLE_PATHS is passed as workerData.

11. **CSRF.**
    - Start applies defaultCsrfMiddleware only without a start instance (createStartHandler.ts:704-708, verified). Its missing-middleware warning only fires outside production (:787).
    - laroux-start therefore registers the server-function base as a guarded prefix in laroux-server: Origin/Sec-Fetch-Site on every method.
    - A build-time lint warns when src/start.ts sets requestMiddleware without createCsrfMiddleware.
    - csrf: 'enforce' is the proposed default, and 'app-managed' turns the prefix guard off. This is an owner question.

12. **Dev.** Fetch-style reimplementations. Phase 1: /_serverFn routing and worker fetch. Phase 2: the styles endpoint and lazy ids.

13. **Output.** dist/client, dist/server/entry.js (Start's { fetch }) and the self-contained dist/server/index.js.

**Deploy targets.** Node only for now. Start's Cloudflare and Netlify paths go through Vite plugins (taken from the critique, unverified), so they are not available on laroux. Because the adapter exposes a separate fetch entry, a 'workerd' target could wrap it with platform 'neutral', the workerd/worker conditions and the vendored Flight runtime's edge builds, deployed with wrangler and no Vite plugin. That is unverified and gated by an owner question and spike S12. The repo's cf-workers-app recipe (.eser/recipes.json:144) is not a Start app.

**Start RSC (phase 2, behind rsc.enabled).**
- react-start-rsc 0.1.63 makes @vitejs/plugin-rsc and react-server-dom-rspack optional peers, so neither is installed.
- laroux aliases @vitejs/plugin-rsc/{rsc,ssr,browser}, virtual:vite-rsc/* and virtual:tanstack-rsc-* onto laroux-rsc, and answers import.meta.viteRsc.* at build time.
- The provider environment becomes rsc, fully bundled. The build order comes from S8.
- S2 and S8 also check that compiling loadModule to a static relative import between outputs keeps AsyncLocalStorage and React singletons correct.

**Upkeep.** Exact @tanstack/* pins, bumped together. Each bump runs the Go ledger --check, the file-path assertions and the conformance matrix.

**Not supported.** Vite plugins. An equivalents table is published.

## RSC and server actions

**Runtime choice.** React's own Flight implementation, react-server-dom-webpack, vendored and unmodified inside laroux-rsc.

Why vendor it:
- react-server-dom-webpack@19.3.1 declares peerDependencies react ^19.3.1, react-dom ^19.3.1 and webpack ^5.59.0, with no peerDependenciesMeta. It also has dependencies neo-async, acorn-loose and webpack-sources (npm view, verified 2026-10-16).
- npm 7+ installs non-optional peers. pnpm 11.18.0 is local and the repo does not set auto-install-peers (`pnpm config get` returns undefined), so pnpm's documented default of true applies. That default was not tested with an install.
- Depending on the package would therefore put webpack in users' trees.
- @vitejs/plugin-rsc 0.5.38 solves the same problem by vendoring: dist/vendor/react-server-dom/package.json is version 19.3.1 (verified). The runtime cjs builds require only react, react-dom and async_hooks, crypto, stream and util (verified).

laroux-rsc vendors only the server.node, server.edge, client.node, client.edge and client.browser builds, in development and production, plus LICENSE.

**The cost.** Security patches no longer arrive through the package manager. Mitigations:
- a refresh script that checks the npm integrity hash
- a scheduled CI freshness job that fails when npm has a newer patch than the vendored copy
- a policy that refresh PRs for React security releases land the same day

plugin-rsc already ships 19.3.1, which shows refreshes can keep pace; React's history includes CVE-2025-55182 (CVSS 10) and later DoS fixes. react and react-dom remain real dependencies, pinned exactly at 19.3.1; the lockfile is at 19.3.0, pnpm-lock.yaml:2528.

Ruled out:
- react-server-dom-esm (a placeholder)
- unbundled (private)
- parcel (needs a shim)
- rspack (single outside maintainer)
- depending on @vitejs/plugin-rsc (required vite peer)
- depending on react-server-dom-webpack (required webpack peer)

The last one is acceptable only if the owner rules webpack-in-node_modules acceptable.

**Graphs.** Three, all fully bundled:
- rsc: react-server and node conditions
- ssr: node
- client: browser

Full bundling is what keeps exactly one React per graph. A third-party server library's own `import 'react'` resolves inside the bundle under the graph's conditions instead of falling back to Node's default resolution. Third-party 'use client' packages also pass through the directive transforms.

serverExternalPackages is an allow-list for native addons. The build fails if a listed package depends on or peer-depends on react. The alternative, running the rsc graph under --conditions=react-server in its own process, is an owner question. S1 checks React identity with a third-party server library.

**Identifier isolation.** transform.define renames `__webpack_require__` and `__webpack_chunk_load__` to `__laroux_rsc_require__` and `__laroux_rsc_chunk_load__` in rsc, the ssr equivalents in ssr, and the client equivalents in client. This applies inside the vendored runtime too, because it is bundled. Each entry installs its own loader, so the rsc and ssr graphs in one process never share a global. S1 verifies that define rewrites the free identifiers in the vendored CJS.

**TS and JSX ordering.** Rolldown applies its TS/JSX transform after plugin transform hooks. The vendored plugin-rsc transforms expect Vite's post-transform JS ESTree. So laroux-rsc filters on /use (client|server)/, lowers the file with rolldown/utils transformSync (exported in 1.2.14, verified) using the environment's jsx options, parses with parseAst, transforms, and returns moduleType 'js' with chained maps. S1 tests both orderings: a 'use client' .tsx file with type-only exports and destructured exports, and inline 'use server' inside a .tsx component.

**'use client'.**
- AST detection covers `export {X} from`, `export *` and destructured exports, which the regex at codebase/directive-analysis.ts:120-182 misses.
- rsc: registerClientReference proxies.
- client: each reference is a dynamic entry.
- ssr: the real module.
- The assets manifest records CSS and transitive JS per reference.
- During SSR the loader calls ReactDOM.preloadModule for the reference chunk and its static imports, and ReactDOM.preinit for its CSS, so React streams modulepreload and stylesheet links next to the content that needs them. S1 checks that they are flushed mid-stream and that hydration has no waterfall.

**Server components** run in React's Flight renderer, so hooks rules, React.cache, client context (19.3), lazy, Suspense and keys behave as documented.

**React server actions (laroux-native).**
- File-level and inline 'use server'. Inline closures are hoisted, and bound arguments are AES-GCM encrypted.
- Ids are SHA-256 of root-relative path#export, unsalted, so they survive redeploys while the code location is unchanged.
- The key comes from LAROUX_ACTIONS_SECRET. In production, a missing key logs a startup warning and falls back to a per-build key, and the docs require the variable for rolling or multi-instance deploys.
- Only manifest entries can be loaded.

Transport:
- JS calls: POST <path>/_.rsc with x-rsc-action and an encodeReply body.
- No-JS forms: POST <path>, then decodeAction and decodeFormState.
- Flight navigation: GET <path>/_.rsc.

Flight has its own URL, following plugin-rsc's `_.rsc` convention, so CDNs, the HTTP cache and bfcache never serve Flight for a document request. Pages that serve both also send Vary: Accept as a backstop. A page and a route.ts on the same segment is a build error, so a POST to a page URL is never ambiguous.

**Version skew.**
- Every Flight and action response carries x-laroux-build. On a mismatch, or when a client-reference import fails, the browser does a hard navigation.
- `laroux build --keep-assets n` keeps earlier hashed client files under dist/client/_prev/<buildId>/.
- S13 tests a page from build N acting against build N+1.

**The guard.** guardActionRequest:
- Origin must match Host or the allow-list.
- Sec-Fetch-Site cross-site is rejected.
- A non-GET request with neither header is rejected.
- The body is capped.
- Error stacks never reach the client.

It matters most on the header-less no-JS path, the one place where a cross-site HTML form can reach an action.

**TanStack Start apps.**
- createServerFn, compiled by Start's own compiler, with Start's CSRF middleware where the app keeps it, plus laroux-server's prefix guard always.
- Start does not support 'use server' (TanStack blog, 2026-04-13; cited by earlier research, not re-read today), so laroux does not add React actions to Start apps.
- In Start RSC mode (phase 2), renderServerComponent and createCompositeComponent run on the vendored runtime through the aliases.

**Interim fix in the shipping code, reframed.**
- POST /_rsc takes the action id only from the RSC-Action header (runtime/server.ts:424-425) and sends no Access-Control headers. A plain cross-site form cannot set that header, and a cross-site fetch that sets it fails the preflight. The confirmed problem is therefore not CSRF.
- The confirmed problem is authorization and attack surface: any HTTP client, curl included, can import any module under dist/server and call any exported function by name after only a typeof check (server.ts:490-494).
- The fix:
  - Allow only actions-manifest.json entries whose export carries Symbol.for('react.server.reference').
  - Cap the body size.
  - Add an Origin/Sec-Fetch-Site check as defense in depth.
- Spike S0 confirms the call-any-export behavior, and checks that a cross-site form is blocked.

## Role of Go

Go stays off three paths:
- **The bundler transform path.** rolldown runs JS hooks in-process, and a synchronous node:ffi call per module would block and serialize the build.
- **The render and request path.** decision-37 forbids goroutines from calling into JavaScript.
- **Browser and React code.** decision-22 keeps it in TypeScript.

laroux must build with ESER_AJAN=disabled, so every Go-backed build job has a TypeScript fallback.

What Go owns:
1. **M3 scaffolding.** The Go eser binary forwards `eser laroux` to the bin, and kitfx runs `laroux init` template cloning. This replaces commands/init.ts:70-76. Templates follow TASK-240.
2. **Repo tooling for this design.** decision-22 gives Go the validators and release tooling, and decision-32 ports source-inspecting validators to Go codebasefx on the M0-T16 lexer.
   - The compat-ledger scanner over the pinned TanStack dists and the vendored Flight runtime, which also asserts the dist paths and exports laroux-start imports.
   - The lockfile-forbid validator for vite and webpack.
   - The vendor-freshness CI job.
   The conformance harness driver could also be a Go command. Whether it is, and which headless browser checks hydration, is an owner question.
3. **M6 candidates behind the bridge**, each called once per build from writeBundle or buildEnd through EserAjanCall (TASK-238 ABI, worker threads per TASK-239), each with a TypeScript fallback and a WIRING.md row:
   - Google font fetching and caching.
   - Possibly route-table generation from collectorfx, if measured faster.
   - Precompression stays on node:zlib unless measured otherwise. The Go standard library has gzip only.
   - Images stay on sharp until a vetted cgo-free AVIF/WebP encoder exists.
4. **An optional httpfx edge,** only after the ADR that decision-31 asks for after M6: TLS, HTTP/3 (quic-go v0.62.0), the sharded rate limiter, trusted proxies, static dist/client through http.ServeContent with precompressed lookup, and ReverseProxy to Node over runtime.http's unixSocket on RouteRaw, with the 30 s WriteTimeout (config.go:17) cleared per request. This is new httpfx code. It earns its place only for HTTP/3 or a shared hardened edge, because the dev ESM-cache concern is already solved by the worker swap.

Per-request work in Go through the bridge, such as rate limiting, is not planned until its synchronous FFI cost has been measured.

## Spikes

- S0: Can a direct HTTP client call a non-'use server' export through the shipped POST /_rsc, and is a cross-site HTML form blocked because it cannot set RSC-Action?
  - How: Build the laroux-app recipe in a scratchpad copy.
1. With curl, send POST /_rsc with RSC-Action naming a non-action export under dist/server and a JSON body. Record whether it ran.
2. From a page on another origin, submit a multipart form (it cannot set the header) and run a fetch that sets the header. Record whether the form fails to reach any action and whether the preflight blocks the fetch.
  - Decides: How urgent the interim fix is, which is expected to be authorization, not CSRF. It also decides whether the Origin check in the fix is defense in depth or required.
- S1: Can a three-graph RSC app be built with plain rolldown 1.2.14 and the vendored react-server-dom-webpack 19.3.1 runtime, and served on Node 26.9+ with neither vite nor webpack in node_modules?
  - How: In the scratchpad:
1. Build four rolldown() calls (rsc scan, rsc, client, ssr), all server graphs with noExternal: true.
2. Copy the runtime builds from the npm tarball into vendor/.
3. Rename __webpack_require__ and __webpack_chunk_load__ per environment with transform.define.
4. Lower TS/JSX with rolldown/utils transformSync before the copied plugin-rsc /transforms. Fixtures: a .tsx 'use client' with type-only and destructured exports, inline 'use server' in a .tsx component, and a third-party 'use client' package from node_modules.

Check:
- hydration without mismatch
- the action round trip and the no-JS form
- bound-argument encryption
- CSS and modulepreload links per reference, flushed mid-stream (ReactDOM.preloadModule)
- React identity: one instance per graph, including a third-party server library that imports react
- the `_.rsc` URL with Cache-Control and Vary
- `pnpm why vite` and `pnpm why webpack` both empty
- `node dist/server/index.js` from a directory with no node_modules
- build time
  - Decides: The AppBuilder and EnvironmentConfig API, whether the define-based rename and TS pre-lowering work, whether vendoring the runtime unmodified is enough, and the cost of full bundling. Every later spike depends on this one.
- S2: What does react-start-rsc 0.1.63 import from @vitejs/plugin-rsc/*, virtual:vite-rsc/*, virtual:tanstack-rsc-* and import.meta.viteRsc.*, and does compiling loadModule to a static relative import between outputs keep singletons correct?
  - How: Grep the dists (starting at plugin-rsc dist/browser.js:3) into a first ledger. Build a stub laroux-rsc that serves those names. Load react-start-rsc's decode entries. Check that start-storage-context's AsyncLocalStorage and React resolve to one instance per graph across dist/server and dist/rsc.
  - Decides: Whether Start RSC through aliases is reachable, and which export names laroux-rsc must keep.
- S3: Do the installed start-plugin-core 1.171.53 dist/esm modules (start-compiler/host.js, server-fn-resolver-module.js, hydrate-when-transform.js, import-protection/*) run inside rolldown transform hooks when imported by file URL?
  - How: Resolve @tanstack/start-plugin-core/package.json and import the modules by URL. Wire createStartCompiler into client and ssr hooks with a '?tss-serverfn-split' load hook, using rsbuild/start-compiler-host.ts as the template. Compile start-basic's server functions and diff against a reference `vite build` run only in the scratchpad. Repeat with a vendored copy of the src to compare effort.
  - Decides: File-path import versus vendoring, how big laroux-start will be, and what goes in the upstream request.
- S4: Do createRolldownPlugin(unpluginRouterGeneratorFactory) and createRolldownPlugin(unpluginRouterCodeSplitterFactory) from router-plugin 1.168.46 work on plain rolldown with unplugin 3.4.0?
  - How: Use a three-route app. Check that routeTree.gen.ts is generated and regenerated when a file is added, that each route gets a split chunk, that the server-only nodes are removed from the client, and that TSS_PRERENDABLE_PATHS is set. List the Vite-only options that are ignored.
  - Decides: Whether the router plugins are reused as they are or the code splitter is vendored.
- S5: Can start-basic, without RSC, be built end to end by a prototype laroux-start and served by a prototype laroux-server, and what host surface does Start's code actually touch?
  - How: Combine S3 and S4 with: the virtual modules, the defines exactly as planning.ts gives them for build, the .env plugin, laroux's NormalizedClientBuild normalizer (routeFilePaths and hydrationIds from moduleIds), buildStartManifest, the resolver, the fully bundled ssr, and prerender through postBuild and prerender in a worker with TSS_PRERENDERING set and the prerenderable paths passed in. Instrument the config, environment and builder objects with a Proxy to log every access.

Verify:
- SSR, client navigation, createServerFn GET and POST
- transitive preloads (#8511, #8548)
- prerendered HTML
- an app with a custom src/start.ts and no CSRF middleware, against laroux-server's prefix guard
- phase-1 dev mode (TSS_DEV_SERVER=false, NODE_ENV=development): base-manifest caching after a rebuild, early hints, the CSRF warning, React dev builds

Count the lines written.
  - Decides: Go or no-go for laroux-start, a measured size, the phase-1 NODE_ENV choice for Start dev, and the first full ledger.
- S6: Which server-side dev strategy keeps memory flat and reloads fast on Node 26.9+, and is the worker boundary correct?
  - How: Run 200 scripted edits on the S1 app with each strategy: worker swap, moduleRunnerTransform with an in-house evaluator, and import(?v=). Measure RSS and heap, p50 and p95 edit-to-response latency, and singleton correctness.

For the worker MessagePort, check request-body transfer, response-body transfer, propagation of a client abort to the worker, backpressure on a slow client, cancellation of a streaming response, and SSE cutoff at the drain timeout. Measure TTFB and throughput against in-thread fetch.

Also check rolldown watch for multi-environment incremental rebuilds that share plugin state (serverFnsById, reference manifests), and time them against full rebuilds.
  - Decides: The phase-1 runner and its drain defaults, whether incremental watch is used, and whether phase 2 switches to a ModuleRunner.
- S7: Can rolldown's DevEngine run standalone as the client dev engine behind laroux's own HTTP server and WebSocket, with Fast Refresh and the import.meta.hot subset TanStack Router injects?
  - How: Run dev() from rolldown/experimental with onOutput and onHmrUpdates feeding an asset store. Write a DevRuntime subclass with accept, dispose and data, and add Fast Refresh in both the laroux-rsc pre-transform and transform.jsx.refresh. Check that state survives an edit. Load TanStack Router's route HMR code and Start's provider accept code.
  - Decides: The scope and timing of phase 2's client HMR, and the import.meta.hot surface laroux-dev has to implement.
- S8: Can one AppBuilder order serve Start RSC, given that Start finds server functions from the client build first and RSC finds references from a scan pass before the client build?
  - How: Read react-start-rsc's plugin/vite.ts and planning.ts provider handling. Prototype start-rscs on the S2 and S5 prototypes. Check createCompositeComponent slots, loadCss, the 'use client' button, and singleton correctness across dist/server and dist/rsc.
  - Decides: Whether Start RSC is phase 2 or out of scope, and which AppBuilder features it needs.
- S9: Is the in-repo runtime.http Node adapter, with per-chunk-flush compression and file-handle static serving, fast enough compared with srvx 1.0.5?
  - How: Use autocannon on Node 26.9+ against the S1 document route and a 200 KB hashed asset. Measure first-shell-byte time with br and gzip flush, throughput, and memory at 500 concurrent streams.
  - Decides: Whether laroux-server keeps and extends the in-repo adapter (expected) or adopts srvx.
- S10: How fast does the upstream surface move?
  - How: Run the Go ledger scanner over the last 10 releases of start-plugin-core, start-server-core, react-start-rsc, router-plugin and react-server-dom-webpack. Record the release-to-release diffs, including dist file-path changes for the modules laroux-start imports.
  - Decides: The bump cadence, whether file-path import is stable enough or vendoring wins, and the maintenance estimate in ADR 0008.
- S11: Is TanStack open to host-neutral exports (createStartCompiler, buildStartManifest, the resolver generator, prerender and postBuild) or a rolldown/unplugin Start adapter?
  - How: The owner, or an agent the owner explicitly authorizes, opens a GitHub discussion on TanStack/router with the S3 and S5 prototypes. This is a question, not a pull request. Record the answer and its date in ADR 0008.
  - Decides: How long the file-path imports or vendor/ copy live, and the risk rating for owning a third host.
- S12 (only if the owner wants edge targets): Can the Start adapter's fetch entry build for workerd with platform 'neutral', the workerd/worker conditions and the vendored Flight runtime's edge builds, and deploy with wrangler and no Vite plugin?
  - How: Build start-basic's fetch entry for workerd in the scratchpad. Serve dist/client through Workers static assets. Run it in `wrangler dev` with nodejs_compat. Check SSR, server functions and AsyncLocalStorage.
  - Decides: Whether the output contract gains a 'workerd' target, and in which milestone.
- S13: Does the skew strategy hold across two deploys?
  - How: Build N, open a page, then build N+1 with one changed component and one moved action, deployed with --keep-assets 1. From the open page, run an action whose location did not change, a bound-argument action, a moved action, and a navigation that loads a new lazy chunk. Record which succeed, which hard-reload and which fail.
  - Decides: The id and key policy, the default for --keep-assets, and the reload contract.

## Questions for the owner

- Does 'without Vite' also rule out vite and webpack packages in node_modules, for example as required peers of @vitejs/plugin-rsc (vite: "*") and react-server-dom-webpack (webpack: ^5.59.0)?
  - Options: Strict: no vite or webpack at all, enforced by a lockfile gate. Vendor plugin-rsc's MIT /transforms and the react-server-dom-webpack runtime builds unmodified (as plugin-rsc 0.5.38 does). React security patches then need a refresh, enforced by a scheduled freshness check; No vite, but webpack is accepted as an unused peer. Depend on react-server-dom-webpack directly and get patches through the package manager; Disable autoInstallPeers in this repo only. That does not help npm users of laroux, who still get webpack
  - Recommendation: Strict, with the freshness job and a same-day policy for React security releases.
  - Why: Both peers are required with no peerDependenciesMeta (verified). npm 7+ installs them, and the repo does not turn off pnpm's default. The trade is real: vendoring removes automatic patch inheritance, which the previous draft counted as an advantage.
- How does laroux-start get Start's internals that start-plugin-core does not export by name?
  - Options: Import the host-neutral dist/esm modules by file URL from the installed, exactly pinned start-plugin-core: no copy and no drift, but coupled to the dist layout, which the ledger asserts; Vendor the host-neutral src at an exact commit: about 10,243 lines to maintain on top of laroux's own host code; Wait for an upstream host-neutral export; Emulate Vite's plugin host to run @tanstack/react-start/plugin/vite unchanged
  - Recommendation: File-URL import now, with vendoring as the documented fallback and the upstream request (S11) opened at the same time.
  - Why: react-start pins start-plugin-core exactly and its exports map includes ./package.json, so the installed copy always matches. dist/esm keeps one file per module, and none of the needed files import vite or srvx (all verified). Vendoring means owning about 10.2k lines, and emulating Vite means owning most of Vite.
- What does the first TanStack Start release on laroux include?
  - Options: Start without RSC; Start RSC comes later behind S2 and S8; Start with RSC from the first release; Never Start RSC; RSC only in laroux-native
  - Recommendation: Start without RSC.
  - Why: react-start-rsc is 0.1.x, the build order is unresolved, and singleton correctness across outputs is unproven.
- Is phase-1 dev (rebuild, worker swap, full reload, no Fast Refresh, no app WebSockets) an acceptable Start developer experience for the first release?
  - Options: Yes. Ship phase 1 and schedule phase 2 after S6 and S7; No. Hold the Start release until HMR and Fast Refresh land on rolldown/experimental
  - Recommendation: Yes, with the gap documented.
  - Why: Phase 1 uses only stable APIs and avoids Start's lazy dev-id path. Phase 2 depends on experimental APIs whose options changed in three recent rolldown releases. Users will compare it with `vite dev`, so the gap must be stated up front.
- What does 'server actions' mean for each kind of app?
  - Options: createServerFn in Start apps, and React 'use server' only in laroux-native; Also enable React 'use server' inside Start apps through laroux-rsc; Only createServerFn, and retire laroux-native
  - Recommendation: createServerFn in Start, and React 'use server' in laroux-native.
  - Why: TanStack deliberately does not support 'use server'. Adding it would put two RPC systems in one app.
- Why does the laroux framework exist alongside Start on the same core?
  - Options: A server-first RSC framework: React actions, file routes (page, layout, route, proxy), zero config and the eserstack integrations; A thin preset over TanStack Router; Deprecate laroux-native once Start runs
  - Recommendation: A server-first RSC framework with React actions.
  - Why: It is the only home for the React 'use server' half of the goal, and it decides how effort is split between the two adapters.
- Is srvx (from h3js/UnJS, Nitro's organization) acceptable in node_modules, as long as laroux's own bundles and request path never call it?
  - Options: Yes. It arrives as a regular dependency of start-plugin-core, is absent from dist, and is never called; No. Then TanStack Start cannot be supported, because react-start always installs start-plugin-core, which always installs srvx
  - Recommendation: Yes.
  - Why: srvx is a regular dependency of start-plugin-core@1.171.53, so stripping imports cannot remove it (verified). 'Without Nitro' is met because Nitro and h3 are never installed or used, and laroux-server takes the deployment role.
- Should dist/server be a single self-contained bundle (server graphs with noExternal: true), so production deploys need no node_modules?
  - Options: Yes, fully bundled by default, with a serverExternalPackages allow-list for native addons (which must not depend on react); No. Keep node_modules externals in production and accept Babel, Lightning CSS and srvx in the deploy for Start apps; Run the rsc graph in its own process under --conditions=react-server instead of bundling it
  - Recommendation: Fully bundled by default.
  - Why: It is the only way a Start app's production deploy avoids react-start's Babel and Lightning CSS dependencies (verified). It also guarantees one React per RSC graph and gets third-party 'use client' packages transformed. The cost is build time, measured in S1 and S5.
- Do you accept this package split, and where should the `laroux` bin live?
  - Options: New laroux-rsc, laroux-dev (bin `laroux`) and laroux-start; laroux-server becomes a lean host whose ./serve entry is bundled into app output; laroux-server's bin forwards to laroux-dev during 5.x; Fold laroux-rsc into laroux-react and the dev server into laroux-server; Also split laroux-cli out of laroux-dev
  - Recommendation: The split as proposed.
  - Why: The RSC runtime is shared by both adapters, the TanStack coupling stays inside laroux-start, and the production host is small enough to bundle. The case rests on clear APIs and production bundle size, not install weight, which Start apps cannot avoid in development.
- Which deploy targets must Start-on-laroux support?
  - Options: Node only (`node dist/server/index.js`), with edge targets out of scope; Node now, plus a 'workerd' target from the same fetch entry later, behind spike S12; Node, workerd, Netlify and Vercel parity with Start's Vite and Nitro paths
  - Recommendation: Node now, workerd behind S12.
  - Why: Start's Cloudflare and Netlify paths go through Vite plugins (unverified), so they disappear on laroux. The fetch-entry contract keeps a workerd target possible without Vite. The repo's cf-workers-app recipe shows edge use exists, but it is not a Start app.
- How is the laroux break versioned after 5.0.0, given that all 47 packages share one version?
  - Options: Additive in 5.x: new packages and new subpaths, the old pipeline deprecated; delete it in the next repo-wide major; Delete in track L and force 6.0.0 for all 47 packages; Pull only the wire-protocol swap into 5.0.0 (conflicts with keeping M1 and M2 mechanical)
  - Recommendation: Additive in 5.x.
  - Why: decision-29 fixes only the first post-cutover version (5.0.0). A laroux-only removal after it would force a major on every package. The additive path costs carrying two laroux pipelines for a while.
- What CSRF policy applies to Start apps whose src/start.ts drops Start's default CSRF middleware?
  - Options: Enforce: laroux-server guards the server-function prefix (Origin/Sec-Fetch-Site) for every Start app, with an explicit 'app-managed' opt-out, plus a build-time warning; Warn only: build-time lint plus documentation; Do nothing; this is the app's responsibility
  - Recommendation: Enforce, with the opt-out.
  - Why: Start applies defaultCsrfMiddleware only without a start instance (createStartHandler.ts:704-708), and its warning fires only outside production (:787). So a production app can silently lose CSRF protection.
- Where do the compat ledger and the conformance harness live?
  - Options: Ledger and lockfile gate in Go codebasefx (decision-22, decision-32); conformance driver in Go, with a headless browser such as chromedp for hydration checks; Ledger in Go; conformance driver in TypeScript with Playwright (needs dependency vetting); Both in TypeScript under pkg/@eserstack/codebase, as the previous draft proposed
  - Recommendation: Ledger in Go. Decide the conformance driver after vetting a headless browser.
  - Why: Go owns validators and release tooling (decision-22), and source-inspecting validators are moving to codebasefx on the M0-T16 lexer (decision-32). The conformance harness drives builds and browsers, and the browser tool needs a vetting decision either way.
- When does this work start relative to the Deno exit plan?
  - Options: Port today's laroux mechanically in M0-M2 and ship it; build the platform as track L after M2, in parallel with M3-M6; pull the /_rsc fix and the runtime.http fixes forward; Freeze laroux and leave it out of the first Node release; Fold the new architecture into M1 and M2
  - Recommendation: The first option.
  - Why: M1 is the one red window and should stay mechanical. The /_rsc authorization fix and the facade gaps are needed either way.
- Should existing laroux apps keep their conventions across the change?
  - Options: Keep the conventions (src/app/routes, layout, not-found and error files, laroux.config.ts), adding the page-plus-route.ts conflict rule; change the wire format (/_rsc becomes <path>/_.rsc) and the internals, with Migration notes; Redesign the conventions freely
  - Recommendation: Keep the conventions.
  - Why: The users are the template apps (decision-23), and the old protocol cannot interoperate with React's decoders.
- Should React, react-dom, @tanstack/* and rolldown be pinned to exact versions?
  - Options: Exact pins for react, react-dom and @tanstack/*, plus the vendored Flight runtime at the same React version; rolldown pinned with ~ while phase 2 uses rolldown/experimental; Keep caret ranges
  - Recommendation: Exact pins, with same-day refreshes for React security releases.
  - Why: React's bundler-facing RSC APIs do not follow semver, the vendored runtime must match react exactly, and Start's internals change weekly.

## Risks

- React patches are now manual. Vendoring the react-server-dom-webpack runtime builds removes the webpack peer, but React security fixes stop arriving through the package manager. Given React's RSC CVE history (CVE-2025-55182, CVSS 10, and later DoS fixes), a missed refresh is a direct exposure. Mitigations: an integrity-checked refresh script, a scheduled freshness job that fails on any newer npm patch, and a same-day policy for React security releases.
- Coupling to start-plugin-core's dist layout. Importing dist/esm/* by file URL has no copy drift because react-start pins start-plugin-core exactly, but file paths are not an API. A rename or a bundling change upstream breaks laroux-start at a bump. Mitigations: the ledger asserts every path and export, there is a documented vendor fallback (about 10.2k src lines), and S11 asks upstream for host-neutral exports. Residual: each weekly Start release costs review time (start-plugin-core 1.171.53 and react-start 1.169.2 were published around 2026-10-14; PR #7588 changed the server core).
- Owning the RSC transforms is security-critical. laroux-rsc owns the directive transforms (vendored from plugin-rsc), the reference manifests, closure encryption, the per-environment identifier renames and the loader. The TS/JSX pre-lowering and the define-based rename are unproven until S1. Mitigations: React's decoders, never laroux's own; plugin-rsc's starter ported as a conformance fixture.
- Fully bundled server graphs cost build time and break some packages. Bundling everything makes rsc and ssr builds slower and can break packages that read files relative to __dirname, use native addons, or depend on dynamic require. Mitigations: the serverExternalPackages allow-list with its react-dependency check, and S1 and S5 measure build time.
- Phase-1 dev diverges from what Start supports. Start never pairs TSS_DEV_SERVER=false with NODE_ENV=development. Its cached manifest, early hints, CSRF warning and dev error paths may behave unexpectedly, and the fallback to NODE_ENV production in dev loses React dev warnings. App WebSockets are unsupported in phase-1 dev, and SSE streams are cut when a worker swap passes the drain timeout. Users comparing with `vite dev` will notice the missing HMR first.
- Experimental dev APIs. Phase 2 relies on rolldown/experimental (DevEngine, DevRuntime, hotUpdate, moduleRunnerTransform), whose options changed in 1.2.8, 1.2.12 and 1.2.13. Start's bundled-dev path has open bugs (#8062, #8407; unverified today).
- Start RSC is experimental upstream. react-start-rsc is 0.1.63. Aliasing @vitejs/plugin-rsc/* and virtual:vite-rsc/* ties laroux to an undocumented 0.x surface. The build-order conflict (S8) and singleton correctness across separately built outputs (AsyncLocalStorage, React) are unresolved. Start RSC may be cut.
- CSRF in Start apps depends on app config. A custom src/start.ts with requestMiddleware silently drops Start's default CSRF protection (createStartHandler.ts:704-708), and Start's warning appears only in development (:787). laroux-server's prefix guard covers this unless the owner chooses 'warn only' or the app opts out.
- Version skew across deploys. Hashed chunk replacement and per-build keys break pages rendered by an earlier build. Mitigations: unsalted ids, a required LAROUX_ACTIONS_SECRET, build-id headers with a hard reload, and --keep-assets. A CDN-fronted deploy still needs asset retention configured by the operator.
- Loss of non-Node deploy targets. Start's Cloudflare, Netlify and Vercel paths go through Vite or Nitro (unverified). Start-on-laroux is Node only until a workerd target is designed and tested (S12), which narrows Start's appeal for edge users.
- Shared-version semver. decision-29 fixes only 5.0.0. If track L deletes the old pipeline before the next repo-wide major, it forces 6.0.0 on all 47 packages. Shipping additively in 5.x avoids that but keeps two laroux pipelines alive in the codebase until then.
- Two frameworks on one core double the test matrix and the support load. laroux-native may get less attention once Start works. Mitigation: one output contract, one conformance harness, and an explicit owner statement of why laroux-native exists.
- Work done twice. M0-M2 ports code this design later deletes: TASK-179's rewrite of entry.tsx, smart-refresh and hmr-client; TASK-207's import-map resolver; TASK-208 and TASK-209's renderer tests. Mitigation: keep those tasks mechanical and tag their tests.
- Security in the shipping code. Until the interim fix lands, POST /_rsc lets any client call any export under dist/server (an authorization hole, not CSRF).
- Node host gaps. Ported mechanically, TASK-181 breaks HMR on Node: the upgrade-identity check fails at node-http.ts:494 once server.ts:150-173 rebuilds the response, and 'connected' is lost at hmr-manager.ts:34/:90. Rate-limiter keying needs the peer address from TASK-180. stop() is abrupt.
- Unmeasured performance and size. Worker MessagePort streaming in dev, per-chunk-flush compression compared with srvx, and fully bundled build times have not been measured. The line estimates for laroux's own code (about 4k-7k laroux-start host code, 3k-5k laroux-rsc, 2k-4k host plus plugins, 2k-3k laroux-dev phase 1) are unmeasured guesses; they exclude the vendored Flight runtime and, under the fallback, about 10.2k vendored TanStack lines. Local Node is v26.5.1, below the 26.9 floor.
- The srvx ruling. srvx is always in a Start app's node_modules, as a regular dependency of start-plugin-core, which react-start installs. It is absent from laroux's bundles and request path. If the owner rejects any h3js/UnJS package in node_modules, Start cannot be supported at all.

## Impact on the Deno exit plan

- New backlog item now, runtime-neutral, landing under the current Deno gate before any further release: restrict POST /_rsc to actions-manifest.json entries whose export carries Symbol.for('react.server.reference'), cap the body, and add an Origin/Sec-Fetch-Site check as defense in depth (pkg/@eserstack/laroux-server/runtime/server.ts:423-539; the action id is read only from the RSC-Action header at :424-425, and the typeof-only check is at :490-494). It is framed as an authorization and attack-surface fix, not CSRF. TASK-9 (Done) covered only containment to dist/server. Spike S0 sets the priority.
- TASK-180 (M0-T7): widen it to the handler-info shape (request, { remoteAddr, signal }), graceful drain, timeouts, an optional unix socket and opt-in trustProxy, or split the extras into a follow-up @eserstack/standards task.
- TASK-181 (M0-T8): return the /hmr upgrade Response unwrapped (node-http.ts:494 against server.ts:150-173 and :655-660), send 'connected' from the open event (hmr-manager.ts:34, :90), bind config.server.host and key the limiter on remoteAddr. The acceptance test runs on Node. Everything else stays mechanical.
- TASK-182 (M0-T9): unchanged. Ticket these with it: pass platform, conditionNames and codeSplitting (rolldown.ts:204-211); use transform.define; config.build.minify is ignored (laroux-bundler/types.ts:41-75); fix the 'ADR 0002' references to 0004; remove the stale jsr-resolver-plugin.ts entry from deno.extra.json.
- TASK-179, TASK-207, TASK-208 and TASK-209: keep them mechanical. Do a careful createElement rewrite only for the files that survive (runtime/navigation, runtime/image, span-renderer), and tag the tests for files that track L deletes.
- TASK-237 (M2-T6): keep its 'one React copy and one action registry' gate. Make its packed-CLI smoke job reusable. Track L redefines the gate as one React per graph, plus running `node dist/server/index.js` with no node_modules.
- TASK-227 (M1-T33): fix laroux-app only enough to run on Node, including the broken @eserstack/laroux-core imports. The laroux-start-app recipe and the TASK-240 template patches belong to track L.
- Versioning: decision-29 governs only 5.0.0. Track L ships additively in 5.x minors (new packages laroux-rsc, laroux-dev and laroux-start; new subpaths such as @eserstack/bundler/host and the laroux-react entries; old pipeline deprecated). L9's deletion is deferred to the next repo-wide major unless the owner picks another option. Record this as a new decision.
- New ADRs before track L (docs/adr ends at 0004, and 0005 is reserved for the Deno exit per TASK-174):
- 0006: the platform architecture. The generic rolldown host, the FrameworkAdapter port, the fixed hook list, fetch-style middleware, no Vite plugins, the output contract, and fully bundled server graphs with the allow-list.
- 0007: the RSC runtime. The vendored react-server-dom-webpack runtime and its refresh policy, the vendored plugin-rsc transforms, per-environment identifier renames, TS pre-lowering, `_.rsc` URLs, the skew strategy and the action guard. It explicitly marks docs/adr/0003-ssr-react-key-handling-strategy.md (status Accepted) as Superseded, since preprocessTree is deleted.
- 0008: the TanStack Start adapter. File-URL imports from the pinned start-plugin-core with the vendor fallback, defines that follow planning.ts, prerender in a worker, the CSRF policy, the ledger, the conformance suite, and S11's answer and date.
- New track L after M2, in parallel with M3-M6, with package-scoped tasks:
- L1: spikes S1-S13 in the scratchpad (S0 now).
- L2: bundler host (environments, AppBuilder, EnvironmentManifest, CSS, asset, env, font and image plugins).
- L3: lean laroux-server and the bundled index.js.
- L4: laroux-rsc, with the vendored runtime and the refresh script.
- L5: laroux-dev phase 1 (CLI move, worker swap with the drain protocol, full reload).
- L6: laroux-native on the core.
- L7: laroux-start without RSC, the laroux-start-app recipe and conformance.
- L8: Start RSC, only if S2 and S8 pass.
- L9: delete the old pipeline at the next major.
- L10: laroux-dev phase 2.
- L11: template patches (extends TASK-240).
- L12 (optional): a workerd target, if the owner wants one and S12 passes.
Gates: S1 gates L2 and L4, S3-S5 gate L7, S6 and S7 gate L10, S13 gates the skew defaults in L4.
- Go tooling: add codebasefx validators for compat-ledger (--check, --write) and lockfile-forbid (vite, webpack), built on the M0-T16 lexer and sequenced after TASK-246 and TASK-247 (M3-T5, M3-T6) per decision-32. Add a scheduled CI vendor-freshness job next to go-vuln.
- Supersession candidates to review one by one once L6 lands and again at L9: TASK-169 (?v= reloads), TASK-96, TASK-97 and TASK-161 (the bootstrap copy), TASK-89 and TASK-90 (adapters become plugins), TASK-116, and the parts of TASK-66 and TASK-93 that touch deleted renderer code. The intents of the security tasks TASK-9, 12, 13, 81 and 82 carry forward as laroux-rsc acceptance criteria.
- Decisions that still hold:
- decision-18: delete laroux-runtime and jsx-runtime in TASK-210.
- decision-17: no .tsx in library code.
- decision-22: React, RSC and SSR stay in TypeScript, and Go owns the ledger and the gates.
- decision-31: Node only; the worker swap answers its ESM-cache concern, and the Go edge stays an ADR after M6.
- decision-30: the static handler needs the @std/media-types replacement.
- decision-14: Node >= 26.9. Local Node is 26.5.1, so spikes run on the pinned minor from M0-T2.
- Dependency vetting (tooling-standards) for track L:
- react and react-dom: exact 19.3.1, moving the lockfile from 19.3.0.
- The vendored react-server-dom-webpack runtime (MIT): not a dependency, so neo-async, acorn-loose, webpack-sources and the webpack peer do not enter.
- unplugin 3.4.0.
- The @tanstack/react-start set, including its transitive @babel/core, lightningcss, srvx, vitefu, zod, xmlbuilder2 and seroval, which are present in development installs only.
- react-refresh for phase 2.
- A headless browser for conformance, if chosen.
Record attribution for the vendored MIT code (plugin-rsc transforms, the React runtime builds and, under the fallback, the TanStack src) for validate-licenses.
