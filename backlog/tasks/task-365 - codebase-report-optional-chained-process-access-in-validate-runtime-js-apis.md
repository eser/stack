---
id: TASK-365
title: 'codebase: report optional-chained process access in validate-runtime-js-apis'
status: Done
assignee: []
created_date: '2026-10-25 22:37'
updated_date: '2026-10-27 12:00'
labels:
  - codebase
  - validators
dependencies: []
priority: medium
ordinal: 368000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-231: the Go validate-runtime-js-apis check (pkg/ajan/codebasefx/runtime_js_apis.go) does not report `globalThis.process?.<member>` (optional chaining), so pkg/@eserstack/ajan/ffi/resolve.ts and wasm/resolve.ts read Node's process directly without a finding. Either route those reads through the standards runtime facade or record why ajan's resolver must read process directly, once the check catches the form.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The check reports process members reached with optional chaining, through globalThis and aliases, with tests
- [x] #2 Every finding it then reports is fixed or carries a narrow exclude with a reason in .eser/manifest.yml
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause (lines at 1edd0607): pkg/ajan/codebasefx/runtime_js_apis.go:160 (memberAfter) recognised a member only after `.`, and :169 (isGlobalThisMember) only `globalThis.` right before `process`. The lexer emits `?.` as two tokens, so `globalThis.process?.platform` had no member and `globalThis?.process` had no globalThis receiver. A `process` reached through an alias of globalThis (`const g = globalThis as any; g.process.cwd()`) was skipped as any other member access (:126).

Fix: memberAfter and a new receiverBefore accept `.` and `?.`; globalThisAliases collects the names bound to globalThis itself (`const g = globalThis`, with or without a cast), and their `process` counts like `globalThis.process`. Messages show the access as written (`globalThis.process?.cwd`). Deno and Bun members reached with `?.` now name their member too. The TypeScript validate-runtime-js-apis.ts has no matcher of its own (it calls the Go check through the bridge), so it had no separate gap; its test and doc now cover the new forms.

Findings and handling:

- ffi/mod.ts:168 and wasm/resolve.ts:18 had their own copy of the env reader; both now call the exported `getEnvVar` of ffi/resolve.ts, so mod.ts has no finding left. Routing mod.ts through `runtime.env.get` was tried and failed ffi/mod.test.ts ("fallback failures report the native cause alongside the WASM cause"), which runs the loader under `--permission` with reads of ffi/ and wasm/ only: the loader may not load the standards package.
- ffi/resolve.ts (platform, arch, getBuiltinModule, cwd, env), wasm/resolve.ts (cwd), wasm/loader-reactor.ts (`g.process.cwd()`, stdout, stderr) and ffi/library.ts (the exit hook) stay on Node's process. The WASM entry imports them and loads on hosts without Node's built-ins (browsers, Cloudflare Workers), where the cross-runtime entry cannot load: it imports node:child_process, node:http and node:sea statically; and the loader reads only its own files, as above. The cross-runtime layer also has no exit event for library.ts. Each file says so in a comment, and .eser/manifest.yml excludes the four files from validate-runtime-js-apis with those reasons.

Tests: runtime_js_apis_test.go cases for optional chaining, aliases of globalThis, Deno and Bun with `?.`, a file that binds its own process, and the message of `globalThis.process?.env`; validate-runtime-js-apis.test.ts fixtures for `globalThis.process?.cwd()` and `g.process?.exit()`.
<!-- SECTION:NOTES:END -->
