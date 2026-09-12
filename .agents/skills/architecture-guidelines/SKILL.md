---
name: architecture-guidelines
description: "System architecture: ES modules, hexagonal architecture, project structure, ADRs, and testing strategy. Use when designing systems, planning directory layout, writing ADRs, or reviewing architecture."
---

# Architecture Guidelines

Guidelines for system design, project structure, and architectural decisions.

## Quick Start

```typescript
// Use ES Modules with explicit extensions
import * as path from "@std/path";
import { readFile } from "./utils.ts";

export function processFile() {}
```

## Key Principles

- Use ES Modules (avoid CommonJS/AMD)
- Follow consistent directory structure with kebab-case directories
- Document architectural decisions with ADRs including trade-offs
- Write automated tests with CI (target 80%+ coverage for critical paths)
- Use naming conventions: PascalCase for components, camelCase for utilities
- Hexagonal architecture: domain + ports together, adapters separate
- Explicit composition only: import adapters directly, pass as parameters (no
  magic config strings, no convenience factories)

## References

See [rules.md](references/rules.md) for complete guidelines with examples.
