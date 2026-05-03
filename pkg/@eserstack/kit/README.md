# @eserstack/kit

Recipe-based project scaffolding for the eser stack. `kit clone` copies any GitHub repository (or subpath) into your working directory, with optional `recipe.json` support for variable substitution, selective file lists, and post-install commands. `kit new` creates a new project from a named template in the eser registry.

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

| Format | Meaning |
|--------|---------|
| `owner/repo` | GitHub repo, default branch |
| `owner/repo#ref` | GitHub repo at tag or branch |
| `gh:owner/repo` | Same (explicit prefix) |
| `gh:owner/repo/sub/path` | Repo subpath, default branch |
| `gh:owner/repo/sub/path#ref` | Repo subpath at ref |
| `npm:<package>` | Not yet implemented |
| `jsr:@scope/name` | Not yet implemented |

**Slash-bearing branches:** segments after `repo` are subpath until the first `#`. `gh:owner/repo/sub#feature/x` is subpath `sub`, ref `feature/x`. To use a slash-bearing branch as the ref of the repo root, write `gh:owner/repo#feature/x`.

**Subpath scoping:** `recipe.json` is read at the subpath root, not the repo root. `RecipeFile.source` paths are relative to the subpath. Missing `recipe.json` triggers whole-repo mode extracting only the subpath.

## Recipe modes

### Files mode
`recipe.json` declares `files: [{source, target}]`. Each file is fetched individually. Goes through the Go FFI fast path when no advanced features are used.

### Whole-repo mode
`recipe.json` is absent OR declares no `files` array. The entire repo (or subpath) is fetched as a tarball and extracted to the target directory. Always runs through the TypeScript implementation.

## `recipe.json` keys

| Key | Type | Description |
|-----|------|-------------|
| `name` | `string` | Recipe name (required for registry entries) |
| `description` | `string` | Human-readable description |
| `language` | `string` | Primary language |
| `scale` | `"project" \| "structure" \| "utility"` | Recipe scale (required for registry entries) |
| `files` | `RecipeFile[]` | File list (absent → whole-repo mode) |
| `ignore` | `string[]` | Glob patterns to exclude in whole-repo mode |
| `variables` | `TemplateVariable[]` | Variables for `{{.name}}` substitution |
| `requires` | `string[]` | Recipe dependencies (topologically applied) |
| `postInstall` | `string[]` | Commands to run after files are written |
| `dependencies` | `RecipeDependencies` | go/jsr/npm deps to install |

**Ignore example:**
```json
{
  "ignore": ["*.md", "**/*.test.ts", "LICENSE", "test/**"]
}
```

**Variable substitution** applies to file and directory **names** (`{{.var}}` in source/target paths) and file **contents**. Unresolved variables are left as-is.

## Flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--interactive` | `-i` | Prompt for missing variables (with regex retry on `pattern`). Auto-enabled in TTY when required vars are missing. |
| `--no-interactive` | | Suppress TTY auto-prompt |
| `--no-post-install` | | Skip post-install commands |
| `--var key=value` | | Set a variable (repeat for multiple) |
| `--name <dir>` | `-p` | Project name / target subdirectory |
| `--force` | | Overwrite existing files |
| `--dry-run` | | Preview without writing |
| `--skip-existing` | | Skip files that already exist |
| `--verbose` | | Show per-file output |
| `--recipe <path>` | | Path to recipe.json (default: `recipe.json`) |

## Migration from `eser codebase scaffolding`

| Old command | New command |
|-------------|-------------|
| `eser codebase scaffolding gh:owner/repo` | `eser kit clone gh:owner/repo` |
| `eser codebase init` | `eser kit clone <specifier>` |
| `--var key=value` | Same |
| `--interactive` | Same |
| `--skip-post-install` | `--no-post-install` |

YAML `.eser/manifest.yml` is no longer read. Express the same constraints in `recipe.json`: `variables`, `postInstall`, `ignore`.

## Errors and exit codes

| Exit code | Cause |
|-----------|-------|
| 0 | Success |
| 1 | Bad specifier or parse error |
| 1 | Repo or ref not found (HTTP error) |
| 1 | `recipe.json` is malformed JSON |
| 1 | Missing required variable (non-interactive mode) |
| 1 | Post-install command failed |
| 1 | Target path conflict without `--force` |
