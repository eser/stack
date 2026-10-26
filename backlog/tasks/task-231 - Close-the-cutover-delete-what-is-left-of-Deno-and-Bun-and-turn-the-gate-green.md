---
id: TASK-231
title: 'Close the cutover: delete what is left of Deno and Bun and turn the gate green'
status: In Progress
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 18:00'
labels:
  - cutover
  - deno-removal
  - gate
milestone: m-1
dependencies:
  - TASK-197
  - TASK-200
  - TASK-201
  - TASK-202
  - TASK-203
  - TASK-204
  - TASK-205
  - TASK-206
  - TASK-207
  - TASK-208
  - TASK-209
  - TASK-210
  - TASK-211
  - TASK-212
  - TASK-213
  - TASK-214
  - TASK-215
  - TASK-216
  - TASK-217
  - TASK-218
  - TASK-219
  - TASK-220
  - TASK-221
  - TASK-222
  - TASK-223
  - TASK-224
  - TASK-225
  - TASK-226
  - TASK-227
  - TASK-228
  - TASK-229
  - TASK-230
priority: high
ordinal: 231000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Clean-up steps:
- Delete the root deno.json and etc/codemods. The integration agent removes oxc-parser from the root devDependencies if nothing else uses it.
- Remove the Deno excludes from the validate-runtime-js-apis wiring in .eser/manifest.yml:97-117, and the Deno comments in pnpm-workspace.yaml.
- Audit `git grep -wi deno` and `git grep -wi bun` against the ADR 0005 allowlist, and fix or allowlist each remaining match with a reason.
- Grep for the temporary-aid markers named in the codemod headers.
- Reinstall the git hooks so they run `pnpm cli ok`.
Then, with deno and bun removed from PATH, run `pnpm cli ok`, `pnpm cli preflight` and `make ok`, and hand the branch to the owner for merge.

Decisions this task waits on: decision-1 (How agents commit and coordinate, from M0 on and while the gate is red inside M1); decision-12 (Keep supporting users whose own projects use Deno).

Plan key: M1-T37. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deno.json, etc/codemods and every Deno-only file are deleted, and no temporary-aid marker remains
- [x] #2 `git grep -wi deno` and `git grep -wi bun` match only the ADR 0005 allowlist
- [ ] #3 With deno and bun off PATH, `pnpm cli ok`, `pnpm cli preflight` and `make ok` pass, and CI is green on the branch
- [x] #4 Git hooks run `pnpm cli ok`; the owner has the merge request
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Deleted the root deno.json and etc/codemods, with the codemod-tests step and the etc/codemods excludes in .eser/manifest.yml, tsconfig.json, .oxlintrc.json and .oxfmtrc.json, and the codemods section of docs/agents/documentation-and-tooling.md. oxc-parser is now used by nothing but the root devDependencies (integration agent).
- validate-runtime-js-apis: the blanket `.test.ts` exclude is gone. ajan/ffi/mod.test.ts, ajan/wasm/node-reactor-http.test.ts, shell/env/executable.test.ts and etc/scripts/preflight-npm-consumer.test.ts use the runtime facade; ajan/ffi/resolve.test.ts, ajan/wasm/resolve.test.ts and test-kit/leaks.test.ts keep narrow excludes with the reason (they stub or need Node's process directly).
- Removed the Deno comments in pnpm-workspace.yaml and the Deno and Bun globals in .oxlintrc.json; fixed stale Deno and Bun mentions in laroux-server, laroux-bundler, noskills-web, muxfx, bundler/css, cmd/eser and etc/scripts.
- bundler getBuildId no longer reads DENO_DEPLOYMENT_ID (test first; CHANGELOG Migration entry under @eserstack/bundler).
- ADR 0005 Appendix B gained six rows: versions.test.ts, cmd/eser/README.md, the laroux-bundler deno.json notes, the npm-consumer preflight, the Deno Fresh and @std/dotenv attributions, and flake.nix (dontStrip stays while nix/hashes.json pins the 4.5.1 deno compile archives).
- With deno and bun off PATH, `pnpm cli ok`, `pnpm cli preflight` and `make ok` pass locally. AC #3 waits only on CI being green on the branch; AC #4 is the integration agent's (hooks, merge request).
The integration agent removed oxc-parser from the root devDependencies (nothing uses it after etc/codemods) and refreshed pnpm-lock.yaml; `pnpm cli ok` passes again with deno and bun off PATH. AC #4: the hooks are not reinstalled on the branch, because .git/hooks is shared with the main checkout, which still runs Deno until the merge; the integration agent reinstalls them with `pnpm cli codebase install` right after the owner merges cutover into main, then checks that a commit on main runs `pnpm cli workflows run -e precommit`.
2026-10-26: the owner merged cutover into main locally (fast-forward to 5b2c0412). On main, the stale generated artifacts the removed .gitignore rules no longer hid were deleted (the per-package deno.json files from gen-jsr-manifests, docs/api from deno doc, and the node_modules left in the removed jsx-runtime and laroux-runtime directories); `pnpm install --frozen-lockfile` and `make ajan-lib ajan-wasm-check` ran; `pnpm cli codebase install` rewrote pre-commit, commit-msg and pre-push to `pnpm cli workflows run -e <event>`; `pnpm cli ok` passes on main with Node 26.12.1. AC #4 holds. AC #3 still waits for a CI run on the merged main. The hooks need Node 26.9 or later first on PATH (.node-version pins 26.12.1); under an older Node pnpm warns about the engine and node:ffi is off.
<!-- SECTION:NOTES:END -->
