---
id: TASK-233
title: Replace @std utility modules with node built-ins
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-27 10:00'
labels:
  - dependencies
  - std
milestone: m-2
dependencies:
  - TASK-231
priority: high
ordinal: 233000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace each @std utility with a built-in:
- @std/cli/parse-args (23 files) becomes node:util parseArgs. Check flag semantics at each call site.
- @std/path, to-file-url and glob-to-regexp become node:path, node:url and path.matchesGlob.
- @std/fs becomes node:fs/promises (cp, mkdir).
- @std/encoding hex and base64 become Uint8Array.toHex and Buffer.
- @std/dotenv becomes util.parseEnv.
- @std/media-types becomes a small typed MIME table in laroux-server.
Remove the matching npm:@jsr aliases. One commit per package, with lockfile changes made by the integration agent.

Decisions this task waits on: decision-4 (Keep the Deno standard library (@std via JSR) through M1, or remove it during the cutover); decision-30 (Replacements for the JSR-hosted runtime dependencies).

Plan key: M2-T2. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No import of @std/cli, @std/path, @std/fs, @std/encoding, @std/dotenv or @std/media-types remains
- [x] #2 Tests cover CLI flag behavior for each command that used parse-args
- [x] #3 The gate is green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
@std/cli parse-args: @eserstack/shell/args/flags (new sub-path export) gained parseArgs, which runs node:util parseArgs in lenient mode the way the old call sites read their flags: unknown flags stay in values, a string flag without a value reads as "", --flag=false is false, --no-x is its own flag, stopEarly stops at the first positional and drops the first "--" (Command dispatch and the script fallback behave as before). parseFlags and Command use it; FlagDef booleans still default to false, and string[] flags now collect every occurrence instead of keeping the last. codebase (cli-support.parseCliEvent and a parse function per command), kit commands, workflows run/list and cs cli call it; each command exports its parse function and has tests for its flags. Differences from @std/cli: numeric positionals and unknown-flag values stay strings, and an unknown --flag no longer takes the next argument as its value (validate-server-loc read --max-lines that way; it is now declared). @std/path became runtime.path; kit ignore globs use path.matchesGlob with leading dots marked so * and ** still match dot names as in kitfx; laroux-server uses pathToFileURL from node:url. @std/encoding hex became Uint8Array.prototype.toHex in bundler. laroux-server/runtime/media-types.ts is a typed table with the values @std/media-types gave; unlisted extensions fall back to application/octet-stream. @std/fs and @std/dotenv had no imports left (config has its own .env parser since TASK-219). Aliases removed from shell, codebase, kit, workflows, cs, bundler and laroux-server package.json; the lockfile is left to the integration agent. AC #3 open: the gate stops at the native-library validators while the ajan dispatcher ABI change (TASK-238) is in flight; tsc errors are all FFILibrary.symbols from that change.
With TASK-238 and TASK-248 landed and the native library rebuilt, the gate (`pnpm ok`, Go runner) passes on main: "All checks passed!". The integration agent refreshed pnpm-lock.yaml for the removed @std dependencies. AC #3 holds.
<!-- SECTION:NOTES:END -->
