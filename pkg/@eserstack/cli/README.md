# 🖥️ [@eserstack/cli](./)

> **eserstack Tool** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/cli`

Terminal client for Eser's work. A multi-purpose CLI that dispatches to library
modules for codebase management, workflow automation, framework scaffolding, and
more.

Built on a hexagonal architecture: business logic lives in pure handlers
(`@eserstack/kit/recipes/handlers`), output flows through Span-based formatting
(`@eserstack/streams`), and the CLI is just one adapter — the same handlers can
serve MCP tool calls, HTTP APIs, or tests.

## 🚀 Installation

```bash
# Install script (macOS/Linux)
curl -fsSL https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.sh | sh

# Windows (PowerShell)
irm https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.ps1 | iex

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
├── kit                   Kit — recipes, templates, project creation
│   ├── list              Browse available recipes and templates
│   ├── add               Add a recipe to your project
│   ├── new               Create a new project from a template
│   ├── create            Create a new recipe
│   ├── clone             Clone a recipe from any GitHub repo
│   └── update            Re-fetch and update an applied recipe
├── codebase, cb, .       Codebase management tools
│   ├── install           Install git hooks from .eser/manifest.yml
│   ├── uninstall         Remove managed git hooks
│   ├── status            Show git hook installation status
│   ├── commitmsg         Generate commit message from git diff
│   ├── gh                GitHub operations (contributors, releases, tags)
│   ├── versions          Manage workspace package versions
│   ├── changelog-gen     Generate CHANGELOG from commits
│   ├── release           Create a release (bump, changelog, commit, push, tag)
│   ├── rerelease         Delete and recreate the current version tag
│   ├── unrelease         Delete the current version tag and GitHub Release
│   └── validate-*        24 validators — eof, secrets, licenses, circular-deps,
│                         mod-exports, error-coverage, … (`--help` for the list)
├── workflows, wf         Workflow engine — run tool pipelines
│   ├── run               Run workflows by event or id
│   └── list              List available workflows and tools
├── ai                    AI provider interface — ask questions, generate content
│   ├── ask               Send a prompt to an AI provider
│   └── list              List available AI providers
├── noskills, nos         State-machine orchestrator for AI agents
│   ├── init              Initialize noskills in project
│   ├── status            Show current state
│   ├── spec              Manage specs (new, list)
│   ├── next              Get next instruction for agent
│   ├── run               Autonomous execution loop (Ralph loop)
│   └── …                 29 modules in total (`eser noskills --help`)
├── posts                 Compose and manage social media posts across platforms
│   ├── compose           Publish a post to a platform
│   ├── thread            Publish a thread of posts
│   ├── timeline          Fetch your timeline (`--unified` for all platforms)
│   └── …                 15 modules in total (`eser posts --help`)
├── laroux                laroux.js framework commands
│   ├── init              Create a new laroux.js project
│   ├── dev               Start development server with hot reload
│   ├── build             Build for production
│   └── serve             Serve production build locally
├── ajan                  Ajan native bridge commands
│   └── version           Show ajan library version
├── system                Commands related with this CLI
│   ├── install           Install eser globally
│   ├── uninstall         Uninstall eser globally
│   ├── update            Update eser to the latest version
│   ├── completions       Generate shell completion scripts
│   ├── version           Show version and check for updates
│   ├── doctor            Run diagnostic checks
│   └── info              Show runtime and execution context diagnostics
└── (shortcuts)           install, update, version, doctor -> "system <name>"
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

| Option              | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `--name`            | Project name (defaults to template)                                |
| `--var key=value`   | Set template variables (repeatable)                                |
| `--interactive, -i` | Prompt for missing variables interactively (auto-enabled in a TTY) |
| `--no-post-install` | Skip post-install commands                                         |
| `--registry`        | Custom registry URL                                                |
| `--local`           | Use local registry (auto-detected)                                 |

**Available templates:** `library-pkg`, `laroux-app`, `go-service`,
`cf-workers-app`, `vite-app`, `cool-lime-app`, `jsx-runtime-app`, `vanilla-app`

#### kit clone

```bash
eser kit clone <specifier> [target-dir] [options]
```

Clone a recipe from any GitHub repository. Works with or without a `recipe.json`
— repos without one copy the entire tree (whole-repo mode).

| Option              | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `--name, -p`        | Set the `name` variable (shorthand for `--var name=value`)         |
| `--var key=value`   | Set a template variable (repeatable)                               |
| `--interactive, -i` | Prompt for missing variables interactively (auto-enabled in a TTY) |
| `--no-post-install` | Skip post-install commands                                         |
| `--dry-run`         | Preview files without writing                                      |
| `--force`           | Overwrite existing files                                           |
| `--skip-existing`   | Skip files that already exist                                      |
| `--verbose`         | Show detailed output                                               |

**Specifier syntax:**

| Format                       | Description                                |
| ---------------------------- | ------------------------------------------ |
| `gh:owner/repo`              | Clone from GitHub repo root                |
| `gh:owner/repo#ref`          | Clone at a specific branch, tag, or commit |
| `gh:owner/repo/sub/path`     | Clone from a subpath within the repo       |
| `gh:owner/repo/sub/path#ref` | Subpath at a specific ref                  |
| `owner/repo`                 | Shorthand — treated as `gh:owner/repo`     |

**Clone modes:**

- **Files mode** — `recipe.json` declares a `files` array → per-file fetch, Go
  FFI fast path for common recipes
- **Whole-repo mode** — `recipe.json` has no `files`, or `recipe.json` is absent
  → full tree copy with `ignore` glob filtering and binary-file preservation

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

# Cut a release — bumps VERSION and every package.json, writes the CHANGELOG
# section, commits, pushes, then pushes the v<version> tag. That tag push is
# what triggers the release pipeline; CI never tags.
npx eser codebase release patch --dry-run
npx eser codebase release patch

# Recovery: re-fire the pipeline, or remove the tag and its GitHub Release.
# Only while nothing has been published — JSR and npm reject a re-publish.
npx eser codebase rerelease
npx eser codebase unrelease --yes

# Individual pieces
npx eser codebase versions
npx eser codebase changelog-gen
npx eser codebase gh release-notes
npx eser codebase gh release-tag
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

1. **Handlers** (e.g. `@eserstack/kit/recipes/handlers/`) contain pure business
   logic
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

| Package                           | Role                                               |
| --------------------------------- | -------------------------------------------------- |
| `@eserstack/shell/args`           | Command class (routing, lazy loading, completions) |
| `@eserstack/functions/task`       | Task<T,E,R> for DI-aware lazy computation          |
| `@eserstack/streams`              | Output API + Span formatting + Renderers           |
| `@eserstack/kit/recipes/handlers` | Pure business logic handlers                       |

## License

Apache-2.0

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
