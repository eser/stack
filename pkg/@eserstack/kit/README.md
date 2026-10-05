# 🧰 [@eserstack/kit](./)

Recipe-based project scaffolding for the eser stack. `kit clone` copies any
GitHub repository (or subpath) into your working directory, with optional
`recipe.json` support for variable substitution, selective file lists, and
post-install commands. `kit new` creates a new project from a named template in
the eser registry.

## Commands

| Command                      | What it does                                          |
| ---------------------------- | ----------------------------------------------------- |
| `eser kit add <recipe>`      | Add a recipe from the registry to your project        |
| `eser kit list`              | Browse the recipes and templates in the registry      |
| `eser kit new <template>`    | Create a new project from a template (alias `create`) |
| `eser kit clone <specifier>` | Clone a recipe or a whole repo from GitHub            |
| `eser kit update <recipe>`   | Fetch a recipe again and overwrite its files          |

## Quick start

```bash
# Clone a repo that has a recipe.json
eser kit clone gh:eser/some-recipe

# Clone a recipe-less repo into a named directory (whole-repo copy)
eser kit clone gh:eser/laroux my-app

# Clone a subpath of a monorepo
eser kit clone gh:eser/monorepo/packages/foo
```

## Specifier syntax

| Format                       | Meaning                      |
| ---------------------------- | ---------------------------- |
| `owner/repo`                 | GitHub repo, default branch  |
| `owner/repo#ref`             | GitHub repo at tag or branch |
| `gh:owner/repo`              | Same (explicit prefix)       |
| `gh:owner/repo/sub/path`     | Repo subpath, default branch |
| `gh:owner/repo/sub/path#ref` | Repo subpath at ref          |
| `npm:<package>`              | Not yet implemented          |
| `jsr:@scope/name`            | Not yet implemented          |

**Slash-bearing branches:** segments after `repo` are subpath until the first
`#`. `gh:owner/repo/sub#feature/x` is subpath `sub`, ref `feature/x`. To use a
slash-bearing branch as the ref of the repo root, write
`gh:owner/repo#feature/x`.

**Subpath scoping:** `recipe.json` is read at the subpath root, not the repo
root. `RecipeFile.source` paths are relative to the subpath. Missing
`recipe.json` triggers whole-repo mode extracting only the subpath.

## Recipe modes

### Files mode

`recipe.json` declares `files: [{source, target}]`. Each file is fetched
individually. Goes through the Go FFI fast path when no advanced features are
used.

### Whole-repo mode

`recipe.json` is absent OR declares no `files` array. The entire repo (or
subpath) is fetched as a tarball and extracted to the target directory. Always
runs through the TypeScript implementation.

Extraction writes regular files only. It skips symlinks, hardlinks, devices and
tar metadata entries, and drops any entry whose path leads outside the target
directory. It stops with an error once the decompressed tarball passes 256 MiB
or 20,000 entries. GitHub serves the whole repository as one tarball, so both
limits count the files outside a subpath too.

To clone a subpath of a repository you trust that is larger than that, raise the
limits with `--max-bytes` and `--max-entries`, or with the `ESER_KIT_MAX_BYTES`
and `ESER_KIT_MAX_ENTRIES` environment variables. A flag wins over the
environment variable, and the environment variable over the default. Both take a
positive integer:

```bash
# Allow up to 1 GiB and 100,000 entries for this clone
eser kit clone gh:owner/monorepo/packages/foo --max-bytes 1073741824 --max-entries 100000

# The same limits for every clone in this shell
export ESER_KIT_MAX_BYTES=1073741824
export ESER_KIT_MAX_ENTRIES=100000
```

## `recipe.json` keys

| Key            | Type                                    | Description                                  |
| -------------- | --------------------------------------- | -------------------------------------------- |
| `name`         | `string`                                | Recipe name (required for registry entries)  |
| `description`  | `string`                                | Human-readable description                   |
| `language`     | `string`                                | Primary language                             |
| `scale`        | `"project" \| "structure" \| "utility"` | Recipe scale (required for registry entries) |
| `files`        | `RecipeFile[]`                          | File list (absent → whole-repo mode)         |
| `ignore`       | `string[]`                              | Glob patterns to exclude in whole-repo mode  |
| `variables`    | `TemplateVariable[]`                    | Variables for `{{.name}}` substitution       |
| `requires`     | `string[]`                              | Recipe dependencies (topologically applied)  |
| `postInstall`  | `string[]`                              | Commands to run after files are written      |
| `dependencies` | `RecipeDependencies`                    | go/jsr/npm deps to install                   |

**Ignore example:**

```json
{
  "ignore": ["*.md", "**/*.test.ts", "LICENSE", "test/**"]
}
```

**Variable substitution** applies to file and directory **names** (`{{.var}}` in
source/target paths) and file **contents**. Unresolved variables are left as-is.

## Flags

| Flag                | Alias | Description                                                                                                       |
| ------------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `--interactive`     | `-i`  | Prompt for missing variables (with regex retry on `pattern`). Auto-enabled in TTY when required vars are missing. |
| `--no-interactive`  |       | Suppress TTY auto-prompt                                                                                          |
| `--no-post-install` |       | Skip post-install commands                                                                                        |
| `--var key=value`   |       | Set a variable (repeat for multiple)                                                                              |
| `--name <dir>`      | `-p`  | Project name / target subdirectory                                                                                |
| `--force`           |       | Overwrite existing files                                                                                          |
| `--dry-run`         |       | Preview without writing                                                                                           |
| `--skip-existing`   |       | Skip files that already exist                                                                                     |
| `--verbose`         |       | Show per-file output                                                                                              |
| `--recipe <path>`   |       | Path to recipe.json (default: `recipe.json`)                                                                      |
| `--max-bytes <n>`   |       | Whole-repo mode: tarball limit in decompressed bytes (default: 268435456, env: `ESER_KIT_MAX_BYTES`)              |
| `--max-entries <n>` |       | Whole-repo mode: tarball limit in entries (default: 20000, env: `ESER_KIT_MAX_ENTRIES`)                           |

## Migration from `eser codebase scaffolding`

| Old command                               | New command                    |
| ----------------------------------------- | ------------------------------ |
| `eser codebase scaffolding gh:owner/repo` | `eser kit clone gh:owner/repo` |
| `eser codebase init`                      | `eser kit clone <specifier>`   |
| `--var key=value`                         | Same                           |
| `--interactive`                           | Same                           |
| `--skip-post-install`                     | `--no-post-install`            |

YAML `.eser/manifest.yml` is no longer read. Express the same constraints in
`recipe.json`: `variables`, `postInstall`, `ignore`.

## Errors and exit codes

A failed command prints the operation that stopped on stderr, followed by one
`caused by:` line for each step down to the original error, such as the HTTP
status or the JSON syntax error.

| Exit code | Cause                                                           |
| --------- | --------------------------------------------------------------- |
| 0         | Success                                                         |
| 1         | Bad specifier or parse error                                    |
| 1         | Repo or ref not found (HTTP error)                              |
| 1         | `recipe.json` is malformed JSON                                 |
| 1         | Registry file missing, malformed or not registry/v1             |
| 1         | Missing required variable (no default, no prompt answer)        |
| 1         | Post-install command failed                                     |
| 1         | Tarball over the `--max-bytes` or `--max-entries` limit         |
| 1         | `--max-bytes`, `--max-entries` or their variable not an integer |

A target file that already exists is not an error: kit prints a warning, leaves
the file as it is and exits 0. Pass `--force` to overwrite it, or
`--skip-existing` to skip it without the warning.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `eser kit clone` in whole-repo mode fails when the GitHub tarball expands past
  256 MiB or holds more than 20,000 entries, counting entries outside a subpath.
  Raise the limits for a larger template:
  `eser kit clone gh:owner/repo --max-bytes 536870912 --max-entries 40000`, or
  set `ESER_KIT_MAX_BYTES` and `ESER_KIT_MAX_ENTRIES`.
- Tar entries that are not regular files (symlinks, hard links, devices, pax and
  GNU metadata) are skipped, and zero-byte files such as `.gitkeep` are now
  written. A template that relied on a symlink creates it in a post-install
  command.
- Post-install commands stop after 10 minutes
  (`DEFAULT_POST_INSTALL_TIMEOUT_MS`) and fail with `PostInstallError`
  (`exitCode` null, `timeoutMs` set); they used to run without limit. A recipe
  that needs longer passes a larger limit:

  ```typescript
  import * as recipes from "@eserstack/kit/recipes";

  await recipes.applier.applyRecipe(recipe, {
    cwd: ".",
    registryUrl,
    postInstallTimeoutMs: 30 * 60 * 1000, // After: 30 minutes
  });
  ```

- Every kit command prints its failure message on stderr, and `eser kit new`
  without a template exits 1 when the registry cannot be loaded (it exited 0).

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
