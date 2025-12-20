---
name: architecture-guidelines
description: High-level system architecture including module systems, project structure, architectural decision records (ADRs), and testing strategies. Use when designing systems, reviewing structure, or discussing architecture.
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

## References

See [rules.md](references/rules.md) for complete guidelines with examples.
