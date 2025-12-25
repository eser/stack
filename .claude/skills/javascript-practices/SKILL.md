---
name: javascript-practices
description: JS/TS conventions for syntax, modules, and types. Use when writing or reviewing JavaScript/TypeScript code.
---

# JavaScript/TypeScript Practices

Conventions for JS/TS syntax, modules, types, and runtime behavior.

## Quick Start

```typescript
import * as path from "@std/path"; // namespace import
import { utils } from "./utils.ts"; // explicit extension

export function buildConfig() {} // direct named export
const port = config.port ?? 8000; // nullish coalescing
```

## Key Principles

**Modules:** Direct named exports, namespace imports, explicit `.ts` extensions

**Syntax:** `const` over `let`, always semicolons, `===` strict equality, `??`
over `||`

**Types:** `Number()` over `+`, `instanceof` over `typeof`, prefer `null` over
`undefined`

**Runtime:** `import.meta.dirname`, `globalThis` over `window`, optional
`projectRoot` params

**Async:** Use `return await` consistently for better stack traces and correct
error handling

**Avoid:** `eval`, prototype mutation, truthy/falsy checks on non-booleans

## References

See [rules.md](references/rules.md) for complete guidelines with examples.
