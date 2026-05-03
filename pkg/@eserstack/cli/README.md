# 🖥️ [@eserstack/cli](./)

> **eserstack Tool** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/cli`

Terminal client for Eser's work. A multi-purpose CLI that dispatches to library
modules for codebase management, workflow automation, framework scaffolding, and
more.

Built on a hexagonal architecture: business logic lives in pure handlers
(`@eserstack/registry/handlers`), output flows through Span-based formatting
(`@eserstack/streams`), and the CLI is just one adapter — the same handlers can
serve MCP tool calls, HTTP APIs, or tests.

## 🚀 Installation

```bash
# Install script (macOS/Linux)
curl -fsSL https://eser.run/install | sh

# Homebrew (macOS/Linux)
brew install eser/tap/eser

# Nix
nix profile install github:eser/stack

# npm (requires Node.js)
npm install -g eser

# Via pnpm
pnpm add -g eser
# Via Deno
deno install -g -A jsr:@eserstack/cli

# Or run without installing
npx eser <command>
deno run --allow-all jsr:@eserstack/cli <command>
```

## 🛠 Command Tree

```
eser
├── kit                   Recipe distribution & project scaffolding
│   ├── list              Browse available recipes and templates
│   ├── add               Add a recipe to your project
│   ├── new               Create a new project from a template
│   ├── clone             Clone a recipe from any GitHub repo
│   └── update            Re-fetch and update an applied recipe
├── codebase              Codebase management tools
│   ├── install           Install git hooks from .eser/manifest.yml
│   ├── uninstall         Remove managed git hooks
│   ├── status            Show git hook installation status
│   ├── versions          Manage workspace package versions
│   ├── changelog-gen     Generate CHANGELOG from commits
│   ├── release-notes     Sync changelog to GitHub Releases
│   ├── release-tag       Create and push release git tags
│   ├── validate-eof      Ensure files end with newline
│   ├── validate-trailing-whitespace
│   ├── validate-bom      Remove UTF-8 byte order markers
│   ├── validate-line-endings
│   ├── validate-large-files
│   ├── validate-case-conflict
│   ├── validate-merge-conflict
│   ├── validate-json     Validate JSON syntax
│   ├── validate-toml     Validate TOML syntax
│   ├── validate-yaml     Validate YAML syntax
│   ├── validate-symlinks
│   ├── validate-shebangs
│   ├── validate-secrets  Detect credentials and private keys
│   ├── validate-filenames
│   ├── validate-submodules
│   ├── validate-commit-msg
│   ├── validate-docs     Validate JSDoc documentation
│   ├── validate-circular-deps
│   ├── validate-export-names
│   ├── validate-licenses
│   ├── validate-mod-exports
│   ├── validate-package-configs
│   ├── validate-server-loc
│   └── validate-error-coverage
├── workflows             Workflow engine — run tool pipelines
│   ├── run               Run workflows by event or id
│   └── list              List available workflows and tools
├── laroux                laroux.js framework commands
│   ├── init              Create a new laroux.js project
│   ├── dev               Start development server with hot reload
│   ├── build             Build for production
│   └── serve             Serve production build locally
├── system                Commands related with this CLI
├── install               Install eser CLI globally
├── update                Update eser CLI to latest version
├── version               Show version number
└── doctor                Run diagnostic checks
```

## 📋 Commands

### kit

Recipe distribution system — add code recipes, scaffold projects, and pull
utilities from the eser ecosystem. Copy code recipes into your project across
TypeScript and Go, at three scales: projects, structures, and utilities.

```bash
# Browse all available recipes
npx eser kit list
npx eser kit list --language go
npx eser kit list --scale utility

# Add a recipe to your current project
npx eser kit add fp-pipe
npx eser kit add ajan-httpfx
npx eser kit add ajan-httpfx --no-install   # skip auto-installing deps
npx eser kit add fp-pipe --dry-run          # preview without writing

# Create a new project from a template
npx eser kit new laroux-app --name my-site
npx eser kit create go-service --name my-api   # "create" is an alias for "new"

# Clone a recipe from any GitHub repo (not just the registry)
npx eser kit clone eser/ajan

# Re-fetch and update a previously applied recipe
npx eser kit update ajan-httpfx
```

#### kit list

```bash
eser kit list [options]
```

| Option       | Description                                        |
| ------------ | -------------------------------------------------- |
| `--language` | Filter by language: `typescript`, `go`             |
| `--scale`    | Filter by scale: `project`, `structure`, `utility` |
| `--tag`      | Filter by tag                                      |
| `--registry` | Custom registry URL                                |
| `--local`    | Use local registry (auto-detected)                 |

#### kit add

```bash
eser kit add <recipe> [options]
```

| Option            | Description                                       |
| ----------------- | ------------------------------------------------- |
| `--dry-run`       | Preview files without writing                     |
| `--force`         | Overwrite existing files                          |
| `--skip-existing` | Skip files that already exist                     |
| `--no-install`    | Print dependency commands instead of running them |
| `--verbose`       | Show detailed output                              |
| `--var key=value` | Set template variables (repeatable)               |
| `--registry`      | Custom registry URL                               |
| `--local`         | Use local registry (auto-detected)                |

#### kit new

```bash
eser kit new <template> [options]
eser kit create <template> [options]   # alias
```

| Option                | Description                                                            |
| --------------------- | ---------------------------------------------------------------------- |
| `--name`              | Project name (defaults to template)                                    |
| `--var key=value`     | Set template variables (repeatable)                                    |
| `--interactive, -i`   | Prompt for missing variables interactively (auto-enabled in a TTY)     |
| `--no-post-install`   | Skip post-install commands                                             |
| `--registry`          | Custom registry URL                                                    |
| `--local`             | Use local registry (auto-detected)                                     |

**Available templates:** `library-pkg`, `laroux-app`, `go-service`,
`cf-workers-app`, `vite-app`, `cool-lime-app`, `jsx-runtime-app`, `vanilla-app`

#### kit clone

```bash
eser kit clone <specifier> [target-dir] [options]
```

Clone a recipe from any GitHub repository. Works with or without a `recipe.json` — repos without one copy the entire tree (whole-repo mode).

| Option                  | Description                                                            |
| ----------------------- | ---------------------------------------------------------------------- |
| `--name, -p`            | Set the `name` variable (shorthand for `--var name=value`)             |
| `--var key=value`       | Set a template variable (repeatable)                                   |
| `--interactive, -i`     | Prompt for missing variables interactively (auto-enabled in a TTY)     |
| `--no-post-install`     | Skip post-install commands                                             |
| `--dry-run`             | Preview files without writing                                          |
| `--force`               | Overwrite existing files                                               |
| `--skip-existing`       | Skip files that already exist                                          |
| `--verbose`             | Show detailed output                                                   |

**Specifier syntax:**

| Format                       | Description                                          |
| ---------------------------- | ---------------------------------------------------- |
| `gh:owner/repo`              | Clone from GitHub repo root                          |
| `gh:owner/repo#ref`          | Clone at a specific branch, tag, or commit           |
| `gh:owner/repo/sub/path`     | Clone from a subpath within the repo                 |
| `gh:owner/repo/sub/path#ref` | Subpath at a specific ref                            |
| `owner/repo`                 | Shorthand — treated as `gh:owner/repo`               |

**Clone modes:**

- **Files mode** — `recipe.json` declares a `files` array → per-file fetch, Go FFI fast path for common recipes
- **Whole-repo mode** — `recipe.json` has no `files`, or `recipe.json` is absent → full tree copy with `ignore` glob filtering and binary-file preservation

#### Custom registries

Anyone can host their own recipe registry. Create an `eser-registry.json` file
following the [registry schema](https://eser.live/registry/v1.json) and use:

```bash
npx eser kit list --registry https://example.com/my-registry.json
npx eser kit add my-recipe --registry https://example.com/my-registry.json
```

### workflows

Run tool pipelines driven by events (pre-commit, pre-push, etc.).

```bash
# Run all tools for a specific event
npx eser workflows run -e precommit

# Run all tools for pre-push
npx eser workflows run -e prepush

# List available workflows and tools
npx eser workflows list
```

### codebase

Codebase management, validation, and release tools.

```bash
# Initialize a new project — use kit clone instead
npx eser kit clone gh:owner/repo

# Install git hooks
npx eser codebase install

# Check git hook installation status
npx eser codebase status

# Remove managed git hooks
npx eser codebase uninstall

# Validate JSON files
npx eser codebase validate-json

# Validate YAML files
npx eser codebase validate-yaml

# Detect secrets and credentials
npx eser codebase validate-secrets

# Run all validation checks
npx eser codebase validate-eof
npx eser codebase validate-trailing-whitespace
npx eser codebase validate-bom
npx eser codebase validate-line-endings

# Release management
npx eser codebase versions
npx eser codebase changelog-gen
npx eser codebase release-notes
npx eser codebase release-tag
```

### laroux

laroux.js framework commands for building React Server Components applications.

```bash
# Create a new laroux.js project
npx eser laroux init my-app
npx eser laroux init my-blog --template blog

# Start development server
npx eser laroux dev
npx eser laroux dev --port 3000 --open

# Build for production
npx eser laroux build
npx eser laroux build --analyze

# Serve production build
npx eser laroux serve
npx eser laroux serve --port 8080
```

#### laroux init

```bash
eser laroux init [folder] [options]
```

| Option           | Description                                      |
| ---------------- | ------------------------------------------------ |
| `-t, --template` | Project template: minimal, blog, dashboard, docs |
| `-f, --force`    | Overwrite existing files                         |
| `--no-git`       | Skip git initialization                          |
| `--no-install`   | Skip dependency installation                     |

#### laroux dev

```bash
eser laroux dev [options]
```

| Option        | Description                         |
| ------------- | ----------------------------------- |
| `-p, --port`  | Server port (default: 8000)         |
| `-o, --open`  | Open browser automatically          |
| `--no-hmr`    | Disable hot module replacement      |
| `--log-level` | Log level: debug, info, warn, error |

#### laroux build

```bash
eser laroux build [options]
```

| Option        | Description                      |
| ------------- | -------------------------------- |
| `--out-dir`   | Output directory (default: dist) |
| `--clean`     | Clean output directory first     |
| `--no-minify` | Disable minification             |
| `--analyze`   | Analyze bundle size              |

#### laroux serve

```bash
eser laroux serve [options]
```

| Option       | Description                            |
| ------------ | -------------------------------------- |
| `-p, --port` | Server port (default: 8000)            |
| `--dist-dir` | Distribution directory (default: dist) |

### system

```bash
# Install eser CLI globally
eser install

# Update to the latest version
eser update

# Show version
eser version
eser version --bare   # version number only

# Run diagnostic checks
eser doctor
```

## Architecture

The CLI follows a hexagonal (ports & adapters) architecture where:

1. **Handlers** (`@eserstack/registry/handlers/`) contain pure business logic
2. **Streams** (`@eserstack/streams`) provide adapter-agnostic output via Spans
3. **CLI commands** are thin adapters that wire handlers to terminal I/O

```
User types:  eser kit list --language go

CLI adapter (commands/list.ts):
  ├── Parse args with @std/cli/parse-args
  ├── Create Output with ANSI renderer + stdout sink
  ├── Run handler via task.runTask(listRecipes(input), { out })
  └── Return ok/fail result

Handler (handlers/list-recipes.ts):
  ├── Fetch registry
  ├── Filter recipes
  ├── Write to ctx.out using Span constructors (bold, cyan, dim)
  └── Return typed Result

Output pipeline:
  Spans → ANSI renderer → stdout sink → terminal
```

The same handler can be invoked with a different renderer + sink:

- **MCP tool call**: `markdown()` renderer + `buffer()` sink → returns markdown
- **HTTP API**: `plain()` renderer + `buffer()` sink → returns JSON
- **Test**: `plain()` renderer + `buffer()` sink → assert on output

### Key Packages

| Package                        | Role                                               |
| ------------------------------ | -------------------------------------------------- |
| `@eserstack/shell/args`        | Command class (routing, lazy loading, completions) |
| `@eserstack/functions/task`    | Task<T,E,R> for DI-aware lazy computation          |
| `@eserstack/streams`           | Output API + Span formatting + Renderers           |
| `@eserstack/registry/handlers` | Pure business logic handlers                       |

## License

Apache-2.0

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
