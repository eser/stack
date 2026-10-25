# 🔧 [@eserstack/codebase](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/codebase` is
> published on npm under the same name (`pnpm add @eserstack/codebase`); the JSR
> versions stay available but get no updates.

> **eserstack Tool** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/codebase`

`@eserstack/codebase` provides validation tools and project management utilities
for maintaining code quality. It includes the validation tools listed under
Available Tools, git hook management, release tooling, and a workflow
integration layer.

## 🚀 Quick Start

### Install git hooks

```bash
# Install hooks from .eser/manifest.yml into .git/hooks/
npx eser codebase install

# Show installed hook status
npx eser codebase status

# Remove managed hooks
npx eser codebase uninstall
```

### Run individual tools

```bash
# Check JSON syntax
npx eser codebase validate-json

# Fix missing trailing newlines
npx eser codebase validate-eof --fix

# Skip paths that match a regular expression; repeat --exclude for more
npx eser codebase validate-trailing-whitespace --exclude docs/api/ --exclude etc/temp/

# Validate commit message format
npx eser codebase validate-commit-msg --message "feat(core): add feature"
```

### Cut a release

```bash
# Preview: prints old -> new version and whether a changelog entry is due
npx eser codebase release patch --dry-run

# Bump VERSION + every package.json, write the CHANGELOG section, commit
# "chore(codebase): release v<version>", push, then push the v<version> tag
npx eser codebase release patch
```

The tag push is the trigger — CI reacts to `v*.*.*`, never to the commit, and
never creates tags itself (a tag pushed by a workflow's own `GITHUB_TOKEN`
dispatches nothing). `rerelease` re-fires the run by recreating the tag at HEAD;
`unrelease` removes the tag and the GitHub Release. Neither is safe once JSR or
npm has accepted the version — cut a new patch instead.

## 🛠 Available Tools

### Setup

| Command     | Description                                 |
| ----------- | ------------------------------------------- |
| `install`   | Install git hooks from `.eser/manifest.yml` |
| `uninstall` | Remove managed git hooks                    |
| `status`    | Show git hook installation status           |

### Release

| Command         | Description                                              |
| --------------- | -------------------------------------------------------- |
| `release`       | Bump, changelog, commit, push, then push the trigger tag |
| `rerelease`     | Delete and recreate the current version tag at HEAD      |
| `unrelease`     | Delete the current version tag and its GitHub Release    |
| `versions`      | Bump version across all workspace packages               |
| `changelog-gen` | Generate CHANGELOG entry from commits                    |

### AI

| Command     | Description                             |
| ----------- | --------------------------------------- |
| `commitmsg` | Generate a commit message from the diff |

### GitHub

| Command            | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `gh contributors`  | Update contributor list in README.md                  |
| `gh release-notes` | Sync CHANGELOG to GitHub Releases                     |
| `gh release-tag`   | Create and push the release tag (the release trigger) |

### Validation

| Command                        | Description                                    |
| ------------------------------ | ---------------------------------------------- |
| `validate-eof`                 | Ensure files end with newline                  |
| `validate-trailing-whitespace` | Remove trailing whitespace                     |
| `validate-bom`                 | Remove UTF-8 byte order markers                |
| `validate-line-endings`        | Normalize line endings to LF                   |
| `validate-large-files`         | Detect files exceeding size limit              |
| `validate-case-conflict`       | Detect case-conflicting filenames              |
| `validate-merge-conflict`      | Detect merge conflict markers                  |
| `validate-json`                | Validate JSON syntax                           |
| `validate-toml`                | Validate TOML syntax                           |
| `validate-yaml`                | Validate YAML syntax                           |
| `validate-symlinks`            | Detect broken symlinks                         |
| `validate-shebangs`            | Validate shebang consistency                   |
| `validate-secrets`             | Detect credentials and private keys            |
| `validate-filenames`           | Enforce filename conventions                   |
| `validate-submodules`          | Detect git submodules                          |
| `validate-commit-msg`          | Validate conventional commit format            |
| `validate-docs`                | Validate JSDoc documentation                   |
| `validate-circular-deps`       | Detect circular dependencies                   |
| `validate-export-names`        | Validate export naming conventions             |
| `validate-licenses`            | Validate license headers                       |
| `validate-mod-exports`         | Detect modules no package entry point reaches  |
| `validate-server-loc`          | Fail when a non-test file exceeds a line cap   |
| `validate-error-coverage`      | Check error structs for required fields        |
| `validate-self-imports`        | Detect a package importing its own name        |
| `validate-runtime-js-apis`     | Detect runtime globals outside `runtime`       |
| `validate-code-conventions`    | Enforce namespace imports, `??`, no `export *` |

Run any tool with `--help` for options:

```bash
npx eser codebase validate-filenames --help
```

## 📋 Configuration (.eser/manifest.yml)

Tools are configured through `.eser/manifest.yml` at the project root. Each tool
receives its options from the workflow step configuration:

```yaml
stack:
  - javascript
  - golang

workflows:
  - id: default
    on: [precommit, prepush]
    steps:
      # Validation tools with options
      - validate-json:
          exclude:
            - "tsconfig.json"
      - validate-filenames:
          rules:
            - directory: "apps/services/"
              convention: "snake_case"
            - directory: "*"
              convention: "kebab-case"
              exclude:
                - "Makefile"
                - "README.md"
      - validate-secrets:
          allowMissingCredentials: true
      - validate-commit-msg:
          forceScope: true
          allowAsterisk: true
          allowMultipleScopes: true
          types: [ci, chore, docs, feat, fix, perf, refactor, revert, test]

      # Shell commands for external tools
      - shell:
          name: formatter
          command: oxfmt --check
          fixCommand: oxfmt
      - shell:
          name: go-tests
          command: "go test -race ./..."
          workingDirectory: ./apps/services/
          timeout: 300
```

### Baselines

`validate-code-conventions` applies its rules to new code while existing code
is migrated. It records the current violations per file in
`.eser/baselines/code-conventions.json` (the `baseline` step option points
elsewhere), and a file fails only when it has more violations than its baseline
allows. After fixing violations, shrink the baseline:

```bash
npx eser codebase validate-code-conventions --write-baseline
```

## 🔌 API Usage

The package root (`@eserstack/codebase`) is the CLI entry point. The library API
lives under `@eserstack/codebase/mod`:

```typescript
import * as codebase from "@eserstack/codebase/mod";

// Git operations
const commits = await codebase.getCommitsBetween("v1.0.0", "HEAD");
const branch = await codebase.getCurrentBranch();

// Workspace discovery
const packages = await codebase.discoverPackages(".");
```

```typescript
import * as validation from "@eserstack/codebase/validation";

// Run every validator that applies to the stack in .eser/manifest.yml
const report = await validation.validate({ root: "." });

// Get all registered tools as workflow-compatible objects
const tools = validation.getWorkflowTools();

// Run a specific validator programmatically
const validator = validation.getValidator("validate-json");
if (validator !== null) {
  const result = await validator.validate({ root: "." });
}
```

### The shared `system` command tree

`cli-system/` owns the operational commands every shipped binary carries —
`install`, `uninstall`, `update`, `completions`, `version`, `doctor`, `info` —
built once and parameterised by a `CliApp` so `eser`, `noskills` and `laroux`
each get a tree describing themselves.

```typescript
import * as cliSupport from "@eserstack/codebase/cli-support";
// The binary's own command module and package manifest.
import * as module from "./module.ts";
import config from "./package.json" with { type: "json" };

const app = cliSupport.attachStandardCommands(
  module.moduleDef.toCommand("noskills", config.version),
);
```

It attaches to a binary's ROOT command, never to a Module. That is deliberate:
`eser` mounts the very same module object the standalone `noskills` binary
re-roots, so a layer living on the module would appear in both — and
`eser noskills version` would exist, implying a submodule has a version of its
own.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `versions()` rejects with `VersionWriteError` (with `targetVersion` and
  `failures`) when a `package.json` could not be written, and
  does not write `VERSION`. It used to resolve and report those packages as
  updated. Catch it, fix the listed files, then rerun with the explicit target:

  ```bash
  # Before: a failed write still reported success
  eser codebase versions minor
  # After: fix the files in error.failures, then pass error.targetVersion
  eser codebase versions target_version
  ```

- Validator help, `gh --help`, the `--write-baseline` result line of
  `validate-code-conventions`, and the output of
  `validate-docs`, `validate-mod-exports`, `validate-export-names`,
  `validate-circular-deps`, `validate-commit-msg`
  and the standalone `commitmsg` entry go through the shared CLI context. When
  stdout is not a TTY, that output is plain text on stderr instead of stdout.
  Capture both streams: `eser codebase validate-docs > report.txt` becomes
  `eser codebase validate-docs > report.txt 2>&1`.
- For every file-tool validator, an empty `--exclude` value (a trailing
  `--exclude` or `--exclude=`) fails with exit code 1; it used to match every
  path, so nothing was checked. Repeated `--exclude` flags all apply, where only
  the last one did. Pass real patterns and drop extra flags you relied on being
  ignored.
- `validate-runtime-js-apis` reports every reference to a runtime global other
  than Node's in code (through `globalThis`, an alias or a `typeof` check
  included), and members of Node's global `process`, in test files too;
  only `standards/cross-runtime/` is skipped on its own. Text in comments and
  string literals does not count. The check runs in Go and needs the native
  library. Its message is `direct <runtime> API usage: X; use Y from
  @eserstack/standards/cross-runtime`. It has no baseline any more:
  `--write-baseline`, the `baseline` option and
  `.eser/baselines/runtime-js-apis.json` are gone. Switch to `runtime` from
  `@eserstack/standards/cross-runtime`, or list scripts that run without it by
  design in the step's `exclude`.
- `validate-package-configs` and the `./validate-package-configs` export are
  removed: with package.json as the only package config there is nothing to
  compare. Drop the step from `.eser/manifest.yml`.
- The `./lint-plugin` export and its rules (`copyright-header`,
  `no-top-level-arrow-exports`, `prefer-private-fields`) are removed;
  `validate-licenses` still checks license headers.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
