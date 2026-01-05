# eser

Eser Ozvataf's command-line tooling to access things.

## Installation

```bash
# Using npx (no installation required)
npx eser <command>

# Using Deno
deno run -A jsr:@eser/cli <command>

# Global installation via npm
npm install -g eser
```

## Commands

### laroux

laroux.js framework commands for building React Server Components applications.

```bash
eser laroux <subcommand> [options]
```

**Subcommands:**

- `init` - Create a new laroux.js project
- `dev` - Start development server with hot reload
- `build` - Build for production
- `serve` - Serve production build locally

#### init

Create a new laroux.js project from a template.

```bash
eser laroux init [folder] [options]
```

**Options:**

- `-t, --template <name>` - Project template (minimal, blog, dashboard, docs)
  (default: minimal)
- `-f, --force` - Overwrite existing files
- `--no-git` - Skip git initialization
- `--no-install` - Skip dependency installation

**Examples:**

```bash
# Create a new project with default template
eser laroux init my-app

# Create a blog project
eser laroux init my-blog --template blog

# Create without installing dependencies
eser laroux init my-app --no-install
```

#### dev

Start the development server with hot module replacement.

```bash
eser laroux dev [options]
```

**Options:**

- `-p, --port <number>` - Server port (default: 8000)
- `-o, --open` - Open browser automatically
- `--no-hmr` - Disable hot module replacement
- `--log-level <level>` - Log level: debug, info, warn, error (default: info)

**Examples:**

```bash
# Start dev server on default port
eser laroux dev

# Start on custom port and open browser
eser laroux dev --port 3000 --open
```

#### build

Build the application for production.

```bash
eser laroux build [options]
```

**Options:**

- `--out-dir <path>` - Output directory (default: dist)
- `--clean` - Clean output directory first
- `--no-minify` - Disable minification
- `--analyze` - Analyze bundle size

**Examples:**

```bash
# Production build
eser laroux build

# Build with bundle analysis
eser laroux build --analyze

# Build to custom directory
eser laroux build --out-dir ./output --clean
```

#### serve

Serve the production build locally for testing.

```bash
eser laroux serve [options]
```

**Options:**

- `-p, --port <number>` - Server port (default: 8000)
- `--dist-dir <path>` - Distribution directory (default: dist)

**Examples:**

```bash
# Serve production build
eser laroux serve

# Serve on custom port
eser laroux serve --port 8080
```

---

### codebase

Codebase validation and management tools.

```bash
eser codebase <subcommand> [options]
```

**Subcommands:**

- `check` - Run all codebase checks
- `check-circular-deps` - Check for circular dependencies
- `check-docs` - Check documentation coverage
- `check-export-names` - Check export naming conventions
- `check-licenses` - Check license compliance
- `check-mod-exports` - Check module exports
- `check-package-configs` - Check package configurations
- `init` - Initialize a new project from a template

**Options:**

- `-h, --help` - Show help message
- `--root <path>` - Root directory (default: current directory)

**Examples:**

```bash
# Run all checks on current directory
eser codebase check

# Check for circular dependencies
eser codebase check-circular-deps

# Run checks on a specific directory
eser codebase check --root ./my-project
```

## License

Apache-2.0
