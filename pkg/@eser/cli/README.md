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

**Options:**

- `-h, --help` - Show help message
- `--root <path>` - Root directory (default: current directory)

## Examples

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
