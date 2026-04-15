---
name: documentation-conventions
description: "README and documentation conventions: import patterns in examples, emoji preservation, and descriptive text rules. Use when writing or editing README files, package documentation, or code examples in docs."
---

# Documentation Conventions

Guidelines for writing and maintaining package documentation and README files.

## Quick Start

```typescript
// ✅ README examples use namespace imports
import * as functions from "@eserstack/functions";

const result = await functions.run(async function* () { /* ... */ });
const pipeline = functions.collect<string, Error>();
```

## Key Principles

- README code examples must use **namespace imports** (`import * as pkg from "@eserstack/pkg"`)
- Never show sub-path direct imports in README examples
- Never remove existing emojis from files (titles use 🧱, ⚡; footers use 🔗)
- Never strip descriptive details, comments, or explanatory text when rewriting docs
- Preserve all descriptive context — details like "(LIFO cleanup)" exist for a reason

## Anti-Patterns

**"I'll simplify the import for the README"**
No. Always use the namespace pattern. Sub-path exports are for advanced users, not docs.

**"I'll shorten this description to save space"**
No. Preserve descriptive context. If the original says "guaranteed cleanup", keep it.

## References

See [rules.md](references/rules.md) for complete guidelines with examples.
