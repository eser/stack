---
id: TASK-9
title: >-
  Contain RSC-Action module resolution to the server action directory in
  laroux-server
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
  - security-report.md
priority: high
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: high (likelihood high, impact high). Fingerprint: laroux-server/runtime/server/rsc-action-import-no-distdir-containment. Full record, bounded reproduction and proposed code are in security-report.md.

The laroux SSR server dispatches React 19 server actions on POST /_rsc by reading the visitor-supplied RSC-Action header, splitting it on '#' into modulePath and exportName, resolving modulePath against config.distDir/server with runtime.path.resolve, and dynamically importing the resulting file:// URL. Unlike the two sibling static-file handlers in the same file (serveStatic:208, servePublicAsset:265), the RSC-Action path performs no containment check on the resolved path and consults no action whitelist. An unauthenticated visitor can therefore supply a modulePath containing '../' sequences to escape distDir/server and cause import() of any existing .js file on the host filesystem; importing runs the module's top-level code, after which the server invokes the named (or default) export with attacker-controlled JSON arguments (args = await req.json()) spread into actionFn(...args). The .js suffix appended by the handler limits the primitive to importing files that already end in .js, so it is arbitrary-module execution rather than arbitrary-content injection unless a writable or gadget .js exists.

Root cause: server.ts:406-415 resolves an attacker-controlled header value into a filesystem path and passes it to dynamic import() with no post-resolution startsWith(distDir/server) containment check and no whitelist of registered action ids. The deprecated action-registry (domain/action-registry.ts, @deprecated at line 6, invokeAction/registerAction) is never referenced by this route. runtime.path.resolve is bound to Deno @std/path resolve (adapters/deno.ts:330), which normalizes '..', so '../' in the header escapes the intended directory. The identical, guard-free logic is present in the published bundle (dist/chunks/server-*.js).

Intended behaviour: The resolved action-module path must be verified to remain strictly inside distDir/server (path-separator-aware prefix or relative-path check) before import(), and ideally the action id must match a server-built registry of known action modules (the legitimate id format is 'relativePathWithoutExt#exportName', e.g. 'src/app/actions#addComment', per laroux-bundler generateActionId), so that a client-supplied header cannot select an arbitrary module on disk.

Trace:
1. entrypoint pkg/@eserstack/laroux-server/runtime/server.ts:374 (createHandler.processRequest POST /_rsc): actionId = req.headers.get('RSC-Action'); no authentication gate precedes this route (laroux SSR server has no auth middleware; rate limiter default 100/min does not block a single request; middleware proxies and apiHandler do not intercept /_rsc).
2. propagation pkg/@eserstack/laroux-server/runtime/server.ts:393 (processRequest): const [modulePath, exportName] = actionId.split('#'); modulePath is the raw header prefix, unsanitized for '../'.
3. propagation pkg/@eserstack/laroux-server/runtime/server.ts:389 (processRequest): args = await req.json(); attacker-controlled argument array.
4. propagation pkg/@eserstack/laroux-server/runtime/server.ts:406 (processRequest): actionModulePath = runtime.path.resolve(config.distDir,'server',`${modulePath}.js`); @std/path resolve normalizes '..' so '../' escapes distDir/server. No startsWith(distDir/server) check follows (contrast serveStatic:208, servePublicAsset:265).
5. sink pkg/@eserstack/laroux-server/runtime/server.ts:415 (processRequest): actionModule = await import(`file://`+actionModulePath); top-level code of an arbitrary out-of-tree .js executes, then actionFn(...args) is called at line 432 with attacker args.

Conditions:
- authentication_level: None. /_rsc has no auth middleware; it is the public server-action endpoint of the SSR site.
- network_routing: Attacker can send a POST request to /_rsc reachable on the laroux server.
- data_state: A .js file must already exist at the traversed path for import() to succeed (the handler appends '.js'); the host filesystem contains importable .js (the app's own dist/server bundle, node_modules). Escalation to arbitrary command execution additionally requires either an attacker-writable .js path or an existing gadget module whose exported function performs a dangerous action with the supplied args.
- environmental_dependency: Production runtime is Deno with runtime.path bound to @std/path (resolve normalizes '..') and Deno compile --allow-all (import of any file path permitted). The bounded confirmation used Node 26, whose path.resolve '..'-normalization and ESM top-level-execution semantics match Deno @std/path + Deno import() for an absolute base path.

Observed in the audit sandbox: Independently reproduced by verifier v31. serverDir=/scratch/distDir/server. BASELINE 'legit#pwn' resolved to /scratch/distDir/server/legit.js (insideServerDir: true) and returned {"from":"legit","args":["a","b",{"x":1}]}. ATTACK '../../outside/evil#pwn' resolved to /scratch/outside/evil.js (insideServerDir: FALSE); the out-of-tree module's top-level statement executed (printed TOPLEVEL_SIDE_EFFECT_EXECUTED_FROM_OUTSIDE_DISTDIR) and its exported pwn returned {"pwned":true,"receivedArgs":["a","b",{"x":1}]}. ATTACK '../../outside/evil#default' likewise executed and returned {"pwned":true,"viaDefault":true,"receivedArgs":["a","b",{"x":1}]}. This proves the distDir containment escape plus arbitrary-existing-.js module top-level execution and verbatim attacker-arg delivery, matching the source at server.ts:406-415/432. Note: Node reproduction is faithful to production because config.distDir is an absolute path (resolved in startServer, main.ts) and @std/path resolve matches Node path.resolve for an absolute base; the shipped dist/chunks/server-*.js contains the same guard-free code.

Fix strategy: After resolving actionModulePath, enforce a path-separator-aware containment check against the resolved distDir/server directory and reject anything outside it, and constrain the action id to a server-built registry of known action modules (the actions-manifest.json already enumerates valid action files). Optionally reject header values containing path separators/'..' before resolution as defense in depth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: The resolved action-module path must be verified to remain strictly inside distDir/server (path-separator-aware prefix or relative-path check) before import(), and ideally the action id must match a server-built registry of known action modules (the legitimate id format is 'relativePathWithoutExt#exportName', e.g. 'src/app/actions#addComment', per laroux-bundler generateActionId), so that a cli...
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/laroux-server/runtime/server.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
New runtime/path-containment.ts exports resolveWithin(baseDir, relativePath): it rejects absolute inputs, NUL bytes, '..' escapes and the base itself, and compares by path segment (relative), so a sibling such as dist-old never counts as a child of dist. The POST /_rsc action dispatch now resolves the RSC-Action module through resolveWithin(dist/server, ...) and answers 400 before any import when the id escapes; serveStatic and servePublicAsset use the same helper, which also closes the separator-less startsWith prefix check the audit recorded as needs_validation (laroux-server/runtime/server/static-asset-prefix-check-missing-separator). Regression: runtime/path-containment.test.ts (unit cases plus createHandler requests for '../../outside/evil#pwn', an absolute action id, and '/dist//<abs>/dist-secret/flag.txt'); the two request tests fail on the previous server.ts and pass now. Action ids are still not checked against the actions manifest; containment alone removes the arbitrary-module primitive.
<!-- SECTION:NOTES:END -->
