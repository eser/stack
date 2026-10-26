---
id: TASK-236
title: Publish the libraries to npm from CI and verify them in preflight
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 21:20'
labels:
  - npm
  - ci
  - release
milestone: m-2
dependencies:
  - TASK-232
  - TASK-233
  - TASK-234
  - TASK-235
priority: high
ordinal: 236000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a library publish step to the publish job: `pnpm -r build`, then `pnpm -r publish --provenance --access public --no-git-checks`. It skips private packages such as test-kit, and versions already on npm, the way publish-ajan does.
Add preflight steps for:
- the publish dry run
- a consumer smoke test that installs all packed tarballs together into a scratch Node 26 project, with an `overrides` map from each @eserstack/* name to its tarball so the rewritten workspace ranges resolve locally, then imports every export entry
List the @eserstack names that do not exist on npm yet, so the owner can bootstrap them and set up trusted publishing. Record this list in docs/agents/release-and-ci.md.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only).

Plan key: M2-T5. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `pnpm cli preflight` runs the library dry run and the consumer smoke test, and both pass with no registry access for @eserstack names
- [x] #2 The publish job is idempotent per version, skips private packages, and passes in dry-run mode
- [x] #3 The bootstrap list is attached; no agent publishes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- etc/scripts/publish-libraries.ts is the library step. It selects the libraries with `isLibrary` from gen-library-manifests.ts (non-private with `exports`: the 38 libraries; test-kit and the eleven platform packages stay out), asks `npm view <name>@<version> version` for each the way publish-ajan does (eight at a time; published means exit 0 and the version printed), and runs one `pnpm -r --filter <name>... publish --provenance --access public --no-git-checks` for the ones npm lacks. When npm has them all it prints that and exits 0, so a re-run of a version publishes nothing; pnpm's own registry check skips them as well. `--dry-run` asks no registry: it adds `--dry-run --force` (force stops pnpm from looking the versions up) and `--config.@eserstack:registry=http://127.0.0.1:9/`, then checks that pnpm named every `<name>@<version>`. A failed publish names the bootstrap section of docs/agents/release-and-ci.md.
- The publish job in build.yml runs `pnpm -r build` and the script after `pnpm install`, before the bundles: a library publish failure, such as a name npm does not have yet, then stops the release before the bundles go out, and a `full` resume re-runs it idempotently. The job timeout went from 15 to 25 minutes for the 38 publishes; the summary links the npm org.
- dist/ ordering: the smallest correct option needed no reorder and no move. In the release run the bundles are built in smoke-test and reach publish as artifacts in npm-dist/, which is outside the workspace (`pnpm -r` never packs it), while the libraries build into pkg/@eserstack/*/dist of publish's own fresh checkout, so each tarball carries what it should. In the preflight the library steps already run after every bundle step. Checked by running npm-build-cli, npm-build-noskills and npm-build-laroux before the library steps: the packed cli, noskills and laroux-server tarballs carry the library emit and no bundle file (no eser.js, chunks/, dist/ts/ or laroux.js).
- cli bin: `publishConfig.bin` is `{}` in pkg/@eserstack/cli/package.json. pnpm packs `"bin": {}` and leaves bin.ts out of the tarball, so `eser` comes from the eser bundle only. The workspace `bin` stays, so only the published manifest changes and bin.ts stays an entry point for validate-mod-exports (packageEntryPoints in pkg/ajan/codebasefx/workspace_validators.go reads `bin`). gen-library-manifests.ts keeps other publishConfig keys, and its `--check` passes. dist/bin.js and dist/bin.d.ts still ship (they match `dist/**/*.js`); nothing exports them.
- cli/scripts.ts: left as is. `mainPath` (main.ts next to the module) is used only for the `dev` invoker, and `resolveCliPrefix` calls `detectInvoker` without `isDevContext`, so it never gets `dev`; the published library and the bundle take the npm or unknown branch.
- `default` condition: not added. No consumer in the repository or among the bundles requires a library; `require("@eserstack/primitives")` in the scratch consumer fails with ERR_PACKAGE_PATH_NOT_EXPORTED, as expected of ESM-only packages with `types` and `import`.
- etc/scripts/preflight-library-consumer.ts now installs every library together. The consumer under etc/temp/library-consumer gets every library as a `file:` dependency, an `overrides` map in its own pnpm-workspace.yaml from every packed @eserstack name (the libraries, the ajan-* and noskills-* platform packages, test-kit when packed) to its tarball, `strictDepBuilds: false` (no install script runs; none is needed to load), the libraries' `@types/*` devDependencies, and an .npmrc with `@eserstack:registry=http://127.0.0.1:9/`. It installs with `pnpm install --prefer-offline`, fails when the lockfile resolves an @eserstack entry from anything but `file:`, imports all 301 export sub-paths from the packed manifests with `node --no-strip-types`, skips laroux-react's `./client/bootstrap` (a source export by design), and type-checks them with tsc 7 and skipLibCheck off. The `--package` option is gone.
- Proof of no @eserstack registry access: with `@eserstack/fp` removed from the overrides and dependencies, the install fails with `ERR_PNPM_META_FETCH_FAIL GET http://127.0.0.1:9/@eserstack%2Ffp`; with the full map it passes and the lockfile has 95 package keys and 38 importer entries, all `file:`. The dry run prints `→ http://127.0.0.1:9/` for each library and finishes in about a second, which it could not do with a lookup against that host. Third-party packages come from the pnpm store or the registry.
- Finding for a follow-up: the published declarations of @eserstack/standards (dist/versions.d.ts) import `semver` types, and laroux-react and laroux-server import `react` types, while @types/semver and @types/react are devDependencies. A TypeScript consumer with skipLibCheck off gets TS7016 unless it installs them; the consumer installs the libraries' `@types/*` devDependencies, as a React project would. Moving @types/semver into the dependencies of standards (a lockfile change) would fix it for standards.
- Preflight gained `library-publish-dry-run` (`node ./etc/scripts/publish-libraries.ts --dry-run`) after `library-build`; `library-consumer` keeps its name and command.
- Bootstrap list (`npm view <name> version` on 2026-10-26, E404 for each), 43 names, recorded with the owner's steps in docs/agents/release-and-ci.md (Bootstrapping New npm Names): the 38 libraries agents, ai, ajan, app-runtime, bundler, cache, cli, codebase, collector, config, crypto, cs, di, events, formats, fp, functions, http, httpclient, kit, laroux, laroux-bundler, laroux-react, laroux-server, logging, mux, noskills, noskills-client, noskills-web, parsing, posts, primitives, shell, standards, streams, testing, webtransport, workflows, and the five platform packages noskills-darwin-arm64, noskills-darwin-x64, noskills-linux-arm64, noskills-linux-x64, noskills-win32-x64 (all under @eserstack). The six ajan-* packages and the eser, noskills and laroux bundles are on npm at 4.5.2. The steps: a placeholder `0.0.0-bootstrap.0` published by the owner with `--tag bootstrap`, then a trusted publisher (GitHub Actions, eser/stack, build.yml) per name; the release run then publishes the real version with provenance.
- No agent published: every publish command run here carried `--dry-run`; the only registry calls were `npm view` reads.
- AC #1: the preflight steps npm-build-cli, npm-build-noskills, npm-build-laroux, library-build, library-publish-dry-run, library-pack and library-consumer passed through `eser workflows run -e preflight --only <step>` in that order on Node 26.12.1; the two library checks asked no registry for an @eserstack name (see above). AC #2: the dry run passed for all 38 libraries; the version check skipped eser@4.5.2 and @eserstack/ajan-wasm@4.5.2, which npm has, and kept the 38 libraries, which it lacks; private and platform packages are never selected. AC #3: the list is above and in docs/agents/release-and-ci.md. Gate: `pnpm ok` printed "All checks passed!".
<!-- SECTION:NOTES:END -->
