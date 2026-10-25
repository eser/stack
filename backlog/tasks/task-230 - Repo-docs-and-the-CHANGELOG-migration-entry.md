---
id: TASK-230
title: Repo docs and the CHANGELOG migration entry
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 16:00'
labels:
  - cutover
  - docs
  - migration
milestone: m-1
dependencies:
  - TASK-200
  - TASK-226
priority: medium
ordinal: 230000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite:
- AGENTS.md: the repository line, the generated deno.json lines, Essential Commands, the baseline write command (`node ./pkg/@eserstack/codebase/validate-code-conventions.ts --write-baseline`), the gate rule, the catalog: reason and the package count.
- docs/agents/*.md, including release-and-ci.md:59-60.
- .github/CONTRIBUTING.md, and .github/ARCHITECTURE.md (tree, bundler backends, binaries, CI graph, portability).
- The root README: badges, prerequisites, install section, and library install lines per decision jsr-publishing.
- The bug-report template: runtime dropdown and placeholder.
- The docs/schema/manifest.json examples, and TODOS.md:19, :284, :314.
Mark security-report.md as a dated report written against the Deno toolchain, and list it in the ADR 0005 allowlist.
Add a CHANGELOG Unreleased, Migration entry with before and after commands. It covers:
- the Node 26.9 floor: the bridge loads through node:ffi, which is on by default from 26.9; koffi is no longer a dependency, `--no-experimental-ffi` turns node:ffi off, and the permission model needs `--allow-ffi`
- Deno and Bun dropped, and the removed ./cross-runtime/deno and ./cross-runtime/bun exports
- the kv capability removal and the HttpHandler info argument
- the deno-bundler backend removal
- DENO_ENV no longer read
- the NOSKILLS_WORKER_RUNTIME deno and bun fallback to node
- JSR frozen at 4.5.x, with the switch for `deno install jsr:@eserstack/cli` users to npm or install.sh
- the jsx-runtime and laroux-runtime removal
- laroux npm-only, with forwarding stubs for installed binaries
- the binary channel status

Decisions this task waits on: decision-14 (Minimum Node.js version); decision-20 (The documented command form for the gate and scripts).

Plan key: M1-T36. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `git grep -ni 'deno\|bun' AGENTS.md docs/agents .github README.md docs/schema TODOS.md` returns nothing
- [x] #2 Every command in AGENTS.md runs as written on the cutover branch
- [x] #3 CHANGELOG.md Unreleased has a Migration section covering every break listed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24 (from TASK-180): Migration items for the standards entry. RuntimeCapabilities lost kv (no API was behind it; Deno and workerd reported true, the others false); remove reads of runtime.capabilities.kv. HttpHandler is now (request, info) with info.remoteAddr ({ hostname, port } or null); handlers that take only request keep compiling. ServeOptions gained onListen. PermissionDeniedError is new (EACCES/EPERM on the Node adapter).

2026-10-24 (from TASK-182): Migration items. @eserstack/bundler lost the deno-bundler backend (createDenoBundlerBackend, DenoBundlerBackend, DenoBundlerBackendOptions, the ./backends/deno-bundler export; BundlerBackend is only "rolldown"). @eserstack/laroux-bundler's bundlerBackend accepts only "rolldown", which is now the default, BundleOptions.platform is "browser" | "node" (no "deno"), and a build no longer copies the project's deno.json and package.json into dist/server. The repl manifest script is gone.
2026-10-25 (from TASK-201): Migration items for the standards entry. The subpath exports @eserstack/standards/cross-runtime/deno and @eserstack/standards/cross-runtime/bun are removed (createDenoRuntime, createBunRuntime). RuntimeName lost "deno" and "bun"; CliInvoker lost "deno", "bun", "bunx"; CliRuntime lost "deno", "bun"; detectInvoker lost its mainModule parameter (now execBasename, runtimeName, argv, envVars, isDevContext?); CliCommandOptions.jsrPackage and codebase CliApp.jsrPackage are removed. shared exports mapStdioToDeno, getDenoStdioOptions, DenoStdioMode and web-streams createFileSinkWritable/FileSinkLike are gone. New: runtime.fs.statSync and runtime.process.isStandalone. An aborted spawn/spawnChild now resolves with the failed result instead of rejecting; makeTempDir() without a prefix creates the directory inside the temp dir.
2026-10-25 (from TASK-210): @eserstack/jsx-runtime and @eserstack/laroux-runtime are removed, with the jsx-runtime-app and laroux-runtime-app recipes; their published 4.5.x versions stay available.
2026-10-26 (from TASK-219 and the integration agent): config's dotenv parser expands a reference to an unset name with no default to "" (it printed `undefined` before) and stops after 10 expansion passes; collector's writeManifestToString fallback no longer formats its output (it piped through deno fmt). DENO_ENV no longer names the environment in config, and `eser cs` (Go csfx and the TypeScript cs package) reads ENV, APP_ENV and NODE_ENV only.
2026-10-26 (TASK-230). Rewrote for the Node and Go tree: AGENTS.md (repository line with the toolchain, the 50-package count, npm-only publishing, `pnpm cli` commands, the go-lint build command, the `node` baseline command, the gate rule, the catalog: reason), docs/agents/*.md (gate, release commands, the release diagram from build.yml, publishing targets with the install scripts and nix/hashes.json, the install dry-run tests, the verify list; the generated-manifest, docs/api and deno.json lines are gone), .github/ARCHITECTURE.md (tree, Go binaries, layers, both CI graphs, portability), .github/CONTRIBUTING.md, the bug-report template, README.md (badges, prerequisites, install with ESER_INSTALL_VERSION, $env:VERSION and the npm fallback, laroux on npm from 5.0.0, the npm library line, the kit output with 13 files and `npm install @eserstack/fp`), .gitignore (the deno.json, deno compile bundle and docs/api rules) and TODOS.md (commands; the deno compile quickjs entry and the Bun GC entry removed as obsolete, the backend-collapse entry closed by ADR 0005, the AI-calls entry narrowed to Node). docs/schema/manifest.json and workflows/WIRING.md had no stale lines left. security-report.md carries a dated-report note, and ADR 0005 Appendix B lists it and ADR 0010 (decision history). CHANGELOG Unreleased Migration: a new first group, Runtime, toolchain and distribution (Node 26.9 and node:ffi with the flags, Deno and Bun dropped, JSR frozen with the `deno install` switch, Go release binaries, noskills launcher and platform packages, laroux npm-only with the stub, install scripts, nix per-entry version, NOSKILLS_WORKER_RUNTIME, DENO_ENV, jsx-runtime and laroux-runtime), and entries under standards, codebase, laroux-runtime, laroux-bundler, bundler, config, cs, collector (new), ajan, httpclient, codebasefx, the bridge, recipes and repository tooling; the Bun-era entries they superseded were rewritten. AC #1 holds as a word match (`git grep -niw`); the substring form also hits bundler, bundle and ubuntu. `--only` in `workflows run` matches tool names, so it cannot select a shell step such as go-lint; docs/agents/workflow.md says so. Left for TASK-231: the Deno comment in pnpm-workspace.yaml and the root deno.json. Verified on the cutover worktree with pnpm_config_verify_deps_before_run=false: `pnpm cli ok` (34 steps), `pnpm cli fix --dry-run`, `pnpm cli test` (5931 pass), `pnpm cli preflight` (12 steps), `pnpm cli go-ok`, `pnpm cli codebase validate-circular-deps`, `pnpm cli --help`, the bridge golangci-lint run and the baseline command (baseline unchanged) all pass; `pnpm cli go-vuln` runs and exits 2 because govulncheck reports 13 Go standard library advisories (GO-2026-6809 among them); `pnpm install` was not run.
<!-- SECTION:NOTES:END -->
