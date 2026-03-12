---
name: coding-practices
description: "Code quality: error handling, validation, logging, DRY, and self-documenting code. Use when writing or reviewing code quality, handling errors, or validating inputs. Do NOT use for language-specific syntax (use javascript-practices or go-practices)."
---

# Coding Practices

Guidelines for writing maintainable, robust, and self-documenting code.

## Quick Start

```typescript
// Self-documenting with proper error handling
function createUser(email: string, age: number): User {
  if (!email.includes("@")) throw new Error("Invalid email");
  if (age < 0 || age > 150) throw new Error("Invalid age");
  return { email, age };
}
```

## Key Principles

- Compare entities by IDs, never by slugs/usernames/strings
- Use meaningful names (self-documenting code)
- Comments explain "why", not "what"
- DRY: abstract when used 3+ times
- Validate all input data
- Handle all error cases with proper Error objects
- Never ignore errors — handle or propagate with context
- Use named constants instead of magic values
- Explicit checks only — never use truthy/falsy for non-booleans
- Early returns to reduce nesting (guard clauses first)

## Anti-Patterns

**"I'll add a quick `if (!value)` check"**
No. Use explicit comparisons: `value === null`, `value === undefined`, `str === ""`.

**"I'll just throw `new Error('failed')`"**
No. Include context: domain-specific error types, `{ cause: error }`, correlation IDs.

## References

See [rules.md](references/rules.md) for complete guidelines with examples.
