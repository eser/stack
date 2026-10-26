---
id: TASK-232
title: Emit JS and declarations for every published library
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 11:04'
labels:
  - npm
  - build
  - release
  - tsc
milestone: m-2
dependencies:
  - TASK-231
priority: high
ordinal: 232000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tsconfig.build.json: tsc 7 emit to dist/ with rewriteRelativeImportExtensions and declaration, or the fallback emitter recorded in M0-T2. It sets noEmit false and drops allowImportingTsExtensions, which requires noEmit or emitDeclarationOnly; rewriteRelativeImportExtensions accepts the .ts specifiers on emit. Add a generator that writes each library's build script, `files` list and publishConfig.exports with types and import conditions, and apply it, one commit per package group. laroux-react keeps a source export for client/bootstrap, because laroux-bundler copies those sources. Add `pnpm -r build` and `pnpm -r pack` to preflight. Inside the workspace, sources still run directly. The full consumer install check waits for M2-T5, because the tarballs still carry @jsr aliases until M2-T2 and M2-T3.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only); decision-14 (Minimum Node.js version); decision-33 (Type checker and emitter).

Plan key: M2-T1. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `pnpm -r build` emits dist/ for all libraries with no .ts specifiers in the .js output
- [x] #2 The packed tarball of primitives, which has no workspace dependencies, imports from a scratch consumer's node_modules on Node 26 without type stripping
- [x] #3 The gate stays green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Root tsconfig.build.json extends tsconfig.json for emit: noEmit false, allowImportingTsExtensions false, rewriteRelativeImportExtensions, declaration, noEmitOnError, and rootDir, outDir, include and exclude written with `${configDir}`. Each library has a one-line tsconfig.build.json that extends it, so tsc 7 emits that package into its own dist/. Tests, benches, `*.fixture.ts`, testdata/, fixtures/, scripts/ and examples/ stay out. tsconfig.json and the type-check step are unchanged. No declarationMap: the maps would point at sources the tarballs do not carry (M0-T2). No fallback emitter was needed; isolatedDeclarations stays on and all 38 libraries emit clean.
- Libraries: every non-private workspace package with `exports`, which is 38: agents, ai, ajan, app-runtime, bundler, cache, cli, codebase, collector, config, crypto, cs, di, events, formats, fp, functions, http, httpclient, kit, laroux, laroux-bundler, laroux-react, laroux-server, logging, mux, noskills, noskills-client, noskills-web, parsing, posts, primitives, shell, standards, streams, testing, webtransport, workflows. Skipped: test-kit (private) and the eleven ajan-* and noskills-* platform packages (no `exports`); directives has no package.json.
- etc/scripts/build-library.ts is every library's `build` script. It first removes the earlier emit from dist/ (JS, declarations, maps, JSON and the copied directories; other files stay, because ajan keeps its native and WASM builds in dist/), runs tsc 7 with the package's tsconfig.build.json, copies runtime assets (`--copy static` for noskills-web, whose server serves static/ from its own directory), and fails on any emitted import, re-export or `import()` that still names a .ts, .tsx, .mts or .cts file. A small lexer skips comments and literals, so JSDoc examples do not count.
- etc/scripts/gen-library-manifests.ts writes `scripts.build`, `files` and `publishConfig.exports` (`types` and `import` per export sub-path) into each library's package.json, and the tsconfig.build.json. It edits the text in place and only changes these fields; new fields go next to `exports`, and the output passes `oxfmt --check`, which lays out package.json like JSON.stringify. A diff check over all 38 manifests found no other change: `exports` still points at the sources, and every dist target exists after a build. `files` is `dist/**/*.js`, `dist/**/*.d.ts` and `dist/**/*.json` (tsc copies the JSON imports, package.json included). It lists no README, because npm and pnpm always pack the root one and a bare `README.md` entry also matched dist/README.md. laroux-react keeps `./client/bootstrap` on its source and ships client.ts, protocol.ts, client/bootstrap/, runtime/image/fallback.ts and runtime/navigation/link-navigation.ts; a test checks this list against BOOTSTRAP_SOURCE_FILES in laroux-bundler. The precommit step `library-manifests` runs it with `--check`.
- The bundles: the eser, noskills and laroux npm-build scripts still write into the dist/ of cli, noskills and laroux-server. The library build removes a bundle's JS and JSON there, and a bundle build removes the library emit, so whichever a later step packs is built last. In preflight the library steps run after every step that uses a bundle. .gitignore now ignores every `pkg/@eserstack/*/dist/`; the validators read git ls-files with .gitignore applied, and oxfmt, oxlint and tsc already excluded dist/.
- Preflight gained `library-build` (`pnpm -r build`), `library-pack` (every package under pkg/@eserstack into etc/temp/npm-packs, which starts empty) and `library-consumer` (etc/scripts/preflight-library-consumer.ts). The consumer check installs the primitives tarball into etc/temp/library-consumer with `pnpm install --ignore-workspace --offline`, imports every export sub-path with `node --no-strip-types`, and type-checks a module that imports every sub-path with tsc 7 and skipLibCheck off. With the source package copied into node_modules instead, the same import fails with ERR_UNKNOWN_FILE_EXTENSION (and with ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING when stripping is on).
- AC #1: `pnpm -r build` built all 38 dist/ directories in about 3 s; the specifier check found no .ts import in the emitted JS. AC #2: library-consumer passed on Node 26.12.1, loading all seven primitives sub-paths and checking their declarations. AC #3: `pnpm ok` printed "All checks passed!" with the new step. pnpm-lock.yaml is unchanged.
- For TASK-236: @eserstack/cli declares `bin: ./bin.ts`, which npm always packs, so the library tarball carries a .ts bin and an `eser` bin that clashes with the eser bundle; it needs `publishConfig.bin` or no bin. The publish job must build the bundles and the libraries in an order that leaves what each publish step packs, or move the bundles out of dist/ (a workflow change). Packed manifests keep `"@eserstack/test-kit": "<version>"` in devDependencies (a private package; harmless for consumers). Only the `import` condition is written, so `require()` of a library fails; add `default` if CJS consumers matter. cli/scripts.ts finds the CLI at `main.ts` next to itself, which does not exist in dist/. The consumer check handles one package without workspace dependencies; the all-tarballs install with `overrides` is TASK-236's.
- For TASK-237: laroux-server already builds to dist/ (dist/cli.js, dist/main.js), so the laroux bin can point there once laroux-server/scripts/npm-build.ts is deleted.
<!-- SECTION:NOTES:END -->
