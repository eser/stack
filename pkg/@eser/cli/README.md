# 🖥️ [@eser/cli](./)

Eser's swiss-army-knife tooling for your terminal. A multi-purpose CLI that
dispatches to library modules for codebase management, workflow automation,
framework scaffolding, and more.

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

# Deno
deno install -g -A jsr:@eser/cli

# Or run without installing
npx eser <command>
deno run --allow-all jsr:@eser/cli <command>
```

## 🛠 Command Tree

```
eser
├── codebase              Codebase management tools
│   ├── scaffolding       Initialize project from template
│   ├── install           Install git hooks from .manifest.yml
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
│   └── validate-package-configs
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
# Initialize a new project from template
npx eser codebase scaffolding
npx eser codebase init    # alias for scaffolding

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

## License

Apache-2.0

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
