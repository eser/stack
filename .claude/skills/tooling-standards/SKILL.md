---
name: tooling-standards
description: Development tooling standards including Deno runtime, JSR package registry, and configuration files. Use when setting up projects, managing dependencies, or configuring build tools.
---

# Tooling Standards

Standards for Deno runtime, JSR registry, and project configuration.

## Quick Start

```bash
deno install    # install dependencies
deno fmt        # format code
deno lint       # lint code
deno test       # run tests
```

## Key Principles

**Deno:** Use `deno install/fmt/lint/test` instead of npm commands

**Config files:**

- `package.json` for dependencies and scripts
- `tsconfig.json` for TypeScript
- `deno.json` only for fmt/lint settings

**Registry:** Prefer jsr.io over npm. Use `npm:@jsr/` prefix in package.json

**Packages:** JSR when available, npm when no JSR alternative exists

## References

See [rules.md](references/rules.md) for complete guidelines with examples.
