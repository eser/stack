---
id: m-0
title: "M0 Decide and prepare (Deno gate green)"
---

## Description

Record every decision, set up the root devDependencies and the integration-agent protocol, measure the risky assumptions, and land every runtime-neutral fix, the Go lint validator, the Makefile ajan build, the leaf test-kit and the tested codemods, all without changing the runtime, so the M1 red window is short and mechanical.

Exit criteria:
- ADR 0005 is accepted. It contains the Deno-reference allowlist and the root devDependencies policy, and every needsOwner decision in this plan has a recorded answer, so no M1 task waits on a decision
- `deno task cli ok` passes, and validate-circular-deps reports no cycle with @eserstack/test-kit as a devDependency of every package
- tsc 7 with erasableSyntaxOnly reports 0 TS1294 errors in packages; `git ls-files 'pkg/**/*.tsx'` is empty
- There is no Deno.bundle, Deno.serve or Deno.upgradeWebSocket in non-test library code, and repl-init.ts and pkg/@eserstack/mod.ts are deleted
- A CI job runs `node pkg/@eserstack/cli/main.ts ajan version` and two codebase validators through node:ffi, and it is green
- laroux build of a fixture works with ESER_AJAN=disabled
- The ajan native library and WASM build through make targets, and nothing in the tree (hints, READMEs, .gitignore, workflows, manifest) names ajan/scripts/build.ts
- No test file imports @std/assert or @std/testing/mock directly; all import @eserstack/test-kit
- The codemods pass their fixture tests under `node --test etc/codemods`, resolve oxc-parser from the root devDependencies, and their dry-run counts match the inventory
- The exact Node 26 minor (26.9 or later) that passed the M0-T2 spike and pnpm@11.18.0 are pinned through .node-version and packageManager in every CI job
- If the owner chose the last Deno-era release, it is prepared and the owner has released it before M1 starts
