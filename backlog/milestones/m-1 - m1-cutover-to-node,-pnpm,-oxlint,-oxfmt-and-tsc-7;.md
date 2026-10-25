---
id: m-1
title: "M1 Cutover to Node, pnpm, oxlint, oxfmt and tsc 7; delete Deno and Bun"
---

## Description

Move every package, test, script, CI job, recipe, skill and doc to the new toolchain in one milestone that agents run in parallel, then delete everything Deno- and Bun-specific and stop it from coming back, without breaking any install channel at merge time.

Exit criteria:
- `pnpm cli ok` passes on Node 26 on a machine with no deno on PATH: Go validators, oxfmt --check, oxlint, tsc --noEmit, node --test with LCOV coverage, and the Go check, lint and test
- `pnpm cli preflight` passes, apart from steps the binaries decision removed on purpose
- These are deleted: deno.json, every deno.extra.json, gen-jsr-manifests.ts, the Deno and Bun cross-runtime adapters and invokers, the Deno and Bun FFI backends, the deno compile path and etc/codemods
- validate-runtime-js-apis (TS and Go) reports every Deno and Bun identifier reference in code, including globalThis.Deno, aliased globals and test files, with no excludes
- `git grep -wi deno` and `git grep -wi bun` match only the allowlist recorded in ADR 0005
- No workflow uses setup-deno, and CI is green on the cutover branch
- Against the v4.5.2 release, install.sh and install.ps1 still install eser, noskills, laroux and noskills-server
- AGENTS.md, docs/agents, the skills, the recipes and every package README describe only the new toolchain; git hooks are reinstalled and run `pnpm cli ok`
- The owner has merged the cutover branch
