---
name: tooling-standards
description: "Development tooling: Deno runtime, JSR package registry, deno.json and package.json configuration, and editor settings. Use when setting up projects, choosing packages, or configuring build tools."
---

# Tooling Standards

Standards for Deno runtime, JSR registry, and project configuration.

## Quick Start

```bash
pnpm install    # install dependencies
deno fmt        # format code
deno lint       # lint code
deno test       # run tests
```

## Key Principles

**Package manager:** Use `pnpm install/add` for dependencies; use `pnpm add -g eser` for the CLI tool

**Deno runtime:** Use `deno fmt/lint/test/check/task` for formatting, linting, testing, and running tasks

**Config files:**

- `package.json` for dependencies and scripts
- `tsconfig.json` for TypeScript
- `deno.json` only for fmt/lint settings

**Registry:** Prefer jsr.io over npm. Use `npm:@jsr/` prefix in package.json

**Packages:** JSR when available, npm when no JSR alternative exists

## References

See [rules.md](references/rules.md) for complete guidelines with examples.
