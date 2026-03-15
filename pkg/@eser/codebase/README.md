# 🔧 [@eser/codebase](./)

`@eser/codebase` provides validation tools and project management utilities for
maintaining code quality. It includes 22 validation tools, git hook management,
release tooling, and a workflow integration layer.

## 🚀 Quick Start

### Install git hooks

```bash
# Install hooks from .manifest.yml into .git/hooks/
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

# Validate commit message format
npx eser codebase validate-commit-msg --message "feat(core): add feature"
```

## 🛠 Available Tools

### Setup

| Command       | Description                            |
| ------------- | -------------------------------------- |
| `scaffolding` | Initialize project from template       |
| `install`     | Install git hooks from `.manifest.yml` |
| `uninstall`   | Remove managed git hooks               |
| `status`      | Show git hook installation status      |

### Release

| Command         | Description                                |
| --------------- | ------------------------------------------ |
| `versions`      | Bump version across all workspace packages |
| `changelog-gen` | Generate CHANGELOG entry from commits      |
| `release-notes` | Sync CHANGELOG to GitHub Releases          |
| `release-tag`   | Create and push release git tags           |

### Validation

| Command                        | Description                                 |
| ------------------------------ | ------------------------------------------- |
| `validate-eof`                 | Ensure files end with newline               |
| `validate-trailing-whitespace` | Remove trailing whitespace                  |
| `validate-bom`                 | Remove UTF-8 byte order markers             |
| `validate-line-endings`        | Normalize line endings to LF                |
| `validate-large-files`         | Detect files exceeding size limit           |
| `validate-case-conflict`       | Detect case-conflicting filenames           |
| `validate-merge-conflict`      | Detect merge conflict markers               |
| `validate-json`                | Validate JSON syntax                        |
| `validate-toml`                | Validate TOML syntax                        |
| `validate-yaml`                | Validate YAML syntax                        |
| `validate-symlinks`            | Detect broken symlinks                      |
| `validate-shebangs`            | Validate shebang consistency                |
| `validate-secrets`             | Detect credentials and private keys         |
| `validate-filenames`           | Enforce filename conventions                |
| `validate-submodules`          | Detect git submodules                       |
| `validate-commit-msg`          | Validate conventional commit format         |
| `validate-docs`                | Validate JSDoc documentation                |
| `validate-circular-deps`       | Detect circular dependencies                |
| `validate-export-names`        | Validate export naming conventions          |
| `validate-licenses`            | Validate license headers                    |
| `validate-mod-exports`         | Validate mod.ts export coverage             |
| `validate-package-configs`     | Validate deno.json/package.json consistency |

Run any tool with `--help` for options:

```bash
npx eser codebase validate-filenames --help
```

## 📋 Configuration (.manifest.yml)

Tools are configured through `.manifest.yml` at the project root. Each tool
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
          name: deno-formatter
          command: deno fmt --check
          fixCommand: deno fmt
      - shell:
          name: go-tests
          command: "go test -race ./..."
          workingDirectory: ./apps/services/
          timeout: 300
```

## 🔌 API Usage

```js
import * as codebase from "@eser/codebase";

// Git operations
const commits = await codebase.getCommitsBetween("v1.0.0", "HEAD");
const branch = await codebase.getCurrentBranch();

// Workspace discovery
const packages = await codebase.discoverPackages(".");
```

```js
import * as validation from "@eser/codebase/validation";

// Get all registered tools as workflow-compatible objects
const tools = validation.getWorkflowTools();

// Run a specific validator programmatically
const validator = validation.getValidator("validate-json");
const result = await validator.validate({ root: "." });
```

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
