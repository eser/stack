---
name: design-principles
description: Code design patterns including pure functions, immutability, composition, single responsibility, and async patterns. Use when designing code structure, writing functions, or discussing design patterns.
---

# Code Design Principles

Patterns for writing clean, maintainable, and testable code.

## Quick Start

```typescript
// Pure function with immutability
function updateUser(user: User, age: number): User {
  return { ...user, age }; // new object, no mutation
}
```

## Key Principles

- Pure functions: no side effects, same input = same output
- Immutability: create new objects/arrays instead of mutating
- Single responsibility: one function = one task
- Early returns: reduce nesting, improve readability
- Composition over inheritance: inject dependencies
- Promises over callbacks for async code
- Template strings over concatenation
- Plain objects for data, classes only for stateful services
- Avoid global variables and getters/setters

## References

See [rules.md](references/rules.md) for complete guidelines with examples.
