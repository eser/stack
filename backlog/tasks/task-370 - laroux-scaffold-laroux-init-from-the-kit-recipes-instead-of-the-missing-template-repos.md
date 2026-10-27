---
id: TASK-370
title: 'laroux: scaffold laroux init from the kit recipes instead of the missing template repos'
status: Done
assignee: []
created_date: '2026-10-27 16:00'
labels:
  - laroux
  - kit
  - bug
dependencies: []
priority: high
ordinal: 373000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-240: `laroux init` clones gh:eser/laroux-template-{minimal,blog,dashboard,docs}, and none of those repositories exists (GitHub answers 404), so `laroux init` fails for every template. Owner decision 2026-10-27 (decision-23's second option): `laroux init` scaffolds from the in-repo kit recipes instead of external template repos. Only the laroux-app recipe exists, so `minimal` maps to it; blog, dashboard and docs have no source and leave the template list.

Two more init defects from TASK-240: a failed init leaves an empty project directory behind, and `laroux init --help` scaffolds ./my-laroux-app instead of printing help.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `laroux init` creates the project from a kit registry recipe, `minimal` maps to laroux-app, and no code path builds a gh:eser/laroux-template-* specifier
- [x] #2 blog, dashboard and docs fail with a message that names the available template; the CLI help and the README list only minimal, and the CHANGELOG Migration section records the removal
- [x] #3 A failed init removes the project directory when init created it, and leaves a directory that existed before
- [x] #4 `laroux init --help` and `-h` print the help and create nothing
- [x] #5 Tests for the recipe source, the failure cleanup and --help failed before the fix and pass after it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root causes (lines at b2d0b0c3):

- pkg/@eserstack/laroux-server/commands/init.ts:20 listed four templates, and :68-72 built `gh:eser/laroux-template-<name>` for each, which kit's clone handler fetched from GitHub. None of the four repositories exists.
- Empty directory: kit's clone handler (recipes/handlers/clone-recipe.ts:292) creates the project folder before it downloads the repository tarball. The tarball answers 404, and init.ts:96-105 returned the failure without removing the folder.
- --help: init.ts:26-37 declared no help flag, so parseFlags dropped `--help` and the folder fell back to my-laroux-app (:39). The root command handles --help only before the command name (shell/args/command.ts:349); for a direct module it passes the rest of the arguments to `main` (:405), so each command handles its own --help, as `eser codebase install` does.
- Seen on the way: init.ts:36 declared `--no-install` but never read it; only `--no-git` reached skipPostInstall (:93). The original Deno init mapped both to skipPostInstall.

Changes (laroux-server only):

- commands/init.ts scaffolds through kit's `newProject` handler, the one `eser kit new` uses. `TEMPLATE_RECIPES` maps `minimal` to the laroux-app recipe; any other name fails with "no template named X" and "Available templates: minimal", before anything is created.
- Registry: `--registry` takes the path or URL of a recipes.json, as `eser kit new --registry` does. Without it init passes kit's `DEFAULT_REGISTRY_URL` (eser/stack's .eser/recipes.json on main, raw.githubusercontent.com) explicitly, so a .eser/recipes.json in the user's directory or its parents is never picked up (the native kitNewProject walks up to one when no source is given). Chosen over a copy bundled in the npm package `laroux`: it is how kit already resolves published recipes, init needed the network before as well, and bundling would change the laroux publishing config. The cost: the default registry follows main, not the installed laroux version, and until main on GitHub has the Node laroux-app recipe, `laroux init` without --registry scaffolds the Deno-era one published there now.
- init passes `interactive: true`, as before, which keeps kit on the TypeScript applier. It reads the files of a registry on disk from that registry's directory; the native kitNewProject still reads them from the registryUrl (left as found in TASK-362). The only variable, project_name, always has a value, so nothing prompts.
- The project name is the folder's basename. The folder resolves against the working directory, so a nested or absolute path works.
- A folder that exists, is not empty and is not a directory stops init; `--force` writes over a non-empty folder (newProject always overwrites, where the clone handler used to skip files that existed).
- On a failed or throwing scaffold, init removes the topmost directory it created (the folder, or its first missing parent) and says so in the message; a folder that existed before stays.
- `--help`/`-h` prints help generated from the flags (`helpText()`) and returns.
- `--no-install` and `--no-git` both skip the recipe's post-install commands, as in the original init. laroux-app has none, and init installs nothing, so the closing lines print `npm install` and `npm run dev`. module.ts carries the same flags for completions; the README and the CHANGELOG (Migration, @eserstack/laroux-server) record the removed template names and the --force rule.

Tests (commands/init.test.ts, every fetch answers 404, each test in a new working directory): scaffold from the repository registry; the template map names project recipes of .eser/recipes.json; blog, dashboard and docs fail and create nothing; a failed init removes the folder and its created parents, keeps a folder that existed, and refuses a non-empty folder without --force; --help and -h create nothing; the help lists the flags. Against the old init.ts, 10 of 11 failed; the kept-folder test passes on both.

Verified end to end: `make ajan-lib`, `pnpm -r build`, `pnpm -r --filter "./pkg/@eserstack/*" pack --pack-destination etc/temp/npm-packs`, then `node etc/scripts/preflight-laroux-app.ts --app-dir scratch_dir/app` (OK). With that app's packed `laroux` bin in a new scratch directory: `laroux init demo -t minimal --no-install --registry worktree_dir/.eser/recipes.json` wrote the 13 recipe files, identical to .eser/recipes/laroux-app (`diff -r`), and `node --run build` in demo, on the app's installed packages, built dist/. `laroux init remote --no-install` read the default registry on GitHub. With a registry whose file is missing, `laroux init nested/app` failed and removed nested/; a second run into the existing demo/ stopped at "not empty". `laroux init demo -t blog` exited 1 naming minimal; `laroux init --help` printed the help.

Follow-ups, not done here: `laroux dev`, `build` and `serve` declare no help flag either (commands/dev.ts, build.ts, serve.ts), so `laroux dev --help` would start the server; not run. The laroux-app recipe's package.json is named `@test/laroux-app` and does not use project_name. Pinning the default registry to the release tag would tie the scaffold to the installed version.
<!-- SECTION:NOTES:END -->
