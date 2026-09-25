---
name: design-principles
description: "Function and module design for eserstack in TypeScript and Go. Covers pure functions with thin effectful wrappers, readonly data, small injected interfaces, plain data objects, one clock read, cancellation handles, collections by access pattern, and side-effect-free modules. Use when shaping signatures, modules, state or collections. Not for system layout (use architecture-guidelines)."
---

# Design Principles

How functions, modules, data and state are shaped. System structure lives in
architecture-guidelines; code-level quality rules in coding-practices.

## Always

- Logic lives in pure functions with explicit parameters; a thin wrapper reads
  configuration and performs the effect.
- Return new values instead of mutating inputs; mark unmutated parameters and
  fields `readonly`.
- Accept small interfaces and pass dependencies in; no inheritance for reuse.
- Data is plain objects plus functions; classes only for stateful services, no
  getters or setters.
- Read the clock once per operation and pass the value down.
- One cancellation handle (`ctx`, `AbortSignal`) flows through the whole
  operation; never start a fresh one mid-chain.
- Pick maps and sets for lookups, arrays and slices for sequences; hand out
  copies of internal collections.
- Importing a module does no I/O and reads no environment; compute lazily.

## References

| File                                      | Read when                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| [principles.md](references/principles.md) | Designing a function, module, type or collection; reviewing state handling |
