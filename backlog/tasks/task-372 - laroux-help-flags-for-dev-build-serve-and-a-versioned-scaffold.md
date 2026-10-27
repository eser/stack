---
id: TASK-372
title: 'laroux: help flags for dev, build and serve, and a scaffold that matches the installed version'
status: Done
assignee: []
created_date: '2026-10-27 17:00'
labels:
  - laroux
  - kit
  - bug
dependencies:
  - TASK-370
priority: medium
ordinal: 375000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-370:
- `laroux dev`, `laroux build` and `laroux serve` declare no help flag. The root command handles `--help` only before the command name (pkg/@eserstack/shell/args/command.ts), so `laroux dev --help` reaches the command's main and would start the dev server instead of printing help. Read from the code, not run.
- The laroux-app recipe's package.json is named `@test/laroux-app` and does not use the `project_name` variable, so every scaffolded app carries that name.
- `laroux init` reads kit's default registry, eser/stack's `.eser/recipes.json` on main. A user on an older laroux gets main's recipe, not the one that matches the installed version. Pinning the registry URL to the release tag of the installed version would keep the scaffold and the tool in step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `laroux dev --help`, `laroux build --help` and `laroux serve --help` print help and start nothing, with a test for each
- [x] #2 A project scaffolded from laroux-app has the project's name in its package.json
- [x] #3 `laroux init` without `--registry` reads the recipes of the installed laroux version, or the task notes record why main stays the default
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root causes (lines at 99714c86):

- Help: the root command parses its arguments with `stopEarly` (pkg/@eserstack/shell/args/command.ts:336) and handles `--help` only when it comes before the command name (:349). For a direct module it hands the rest to the module's `main` (:405; :434 for `eser laroux`), so each command handles its own help, as commands/init.ts and codebase/file-tool.ts do. commands/dev.ts:29, serve.ts:29 and build.ts:72 declared no help flag, so `laroux dev --help` parsed to the defaults and went on to `startServer` (dev.ts:91, serve.ts:82) or `runBuild` (build.ts:108). The fix belongs in laroux-server, not in @eserstack/shell.
- Scaffold name: .eser/recipes/laroux-app/package.json:2 was the literal `@test/laroux-app`, although the recipe declares `project_name` (.eser/recipes.json:46-52) and both appliers substitute `{{.project_name}}`.

Changes:

- laroux-server commands/dev.ts, serve.ts, build.ts: each declares `--help`/`-h`, exports `helpText()` (generated from its flags with `shellArgs.generateHelp`, as init does) and returns after printing it, before any adapter is imported or anything starts. `main` takes an optional second argument that replaces the start (`start` in dev and serve, `build` in build) and the output sink; the defaults are the new `startDevServer`, `startProductionServer` and `buildWithDefaultAdapters`, which hold the code that used to be inline. The parsed flags reach them as `DevServerOptions`, `ServeOptions` and `BuildFlagOptions`. The `--log-level` description lists the six levels. README CLI section: one line saying every command takes `--help`.
- .eser/recipes/laroux-app/package.json: `"name": "{{.project_name}}"`, edited as text. laroux init fills project_name with the folder's basename, `eser kit new` with the project name (cmd/eser/kit.go:508, :758; kit handlers/new-project.ts:205-208), and the recipe default is my-laroux-app. The release preflight already passes `--var project_name=laroux-smoke` (etc/scripts/preflight-laroux-app.ts:785-786). The validators, oxfmt, oxlint and tsc exclude .eser/recipes/.

AC #3, why main stays the default registry: a registry URL pinned to the release tag would read the tag's manifest but not the tag's files. For a manifest read from a URL, both appliers fetch the recipe files from the manifest's own `registryUrl` field: the TypeScript one gets `sourceDir` undefined (kit recipes/registry-fetcher.ts:412) and resolves against `manifest.registryUrl` (handlers/new-project.ts:214-215), and the Go one returns `manifest.RegistryURL` for an http source (pkg/ajan/kitfx/registry.go:143-146). That field is `https://raw.githubusercontent.com/eser/stack/main/.eser` in .eser/recipes.json on main and at every tag checked (v4.1.60, v4.4.0, v4.5.0, v4.5.2), and the release does not rewrite it. So a tag URL would pair the tag's file list with main's file contents. No tag has the Node laroux-app recipe or the recipe-based init yet; 5.0.0 will be the first. Two ways to make the pin sound, each outside this package: kit (TypeScript and kitfx) resolving a remote manifest's files against the directory it was fetched from, or the release writing the tag into `registryUrl`. Either is a cross-package change for its own task; `--registry` keeps working for a pinned registry (e.g. `--registry https://raw.githubusercontent.com/eser/stack/v5.0.0/.eser/recipes.json` once the files resolve from the same ref).

Tests:

- New commands/dev.test.ts and serve.test.ts, and build.test.ts extended: `--help` and `-h` return ok, print the usage line and every flag into a buffer sink, and never call the injected start or build (`mock.assertSpyCalls(..., 0)`); without help, the injected start or build gets the parsed flags (port 3000, log level lowered, `--no-hmr`, `--no-minify`, `--clean`). The six help tests failed before the fix (the seam was added first, then the tests, then the help handling) and pass after it.
- commands/init.test.ts: the scaffold test asserts `package.json` name `demo`; it failed with `@test/laroux-app` before the recipe change.
- `node --test pkg/@eserstack/laroux-server/commands/*.test.ts`: 21 of 21 pass. `node pkg/@eserstack/laroux-server/cli.ts dev --help`, `build -h` and `serve --help` print the help and exit.
- `pnpm ok` (go run ./cmd/eser ok) in this worktree: all checks passed, Go included.

No CHANGELOG entry: both are fixes that need nothing from a user, which the Unreleased Migration section does not list; changelog-gen takes them from the commit subjects.
<!-- SECTION:NOTES:END -->
