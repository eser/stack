---
name: javascript-practices
description: "TypeScript and JavaScript conventions of this codebase: namespace imports, cross-runtime access, erasable syntax, explicit checks, async, node:test tests. Use when writing or reviewing .ts, .tsx or .js files (with frontend-practices for UI), process.env or node:fs in libraries, enums, imports, truthy or null checks, or tests. Not for package config or dependencies (use tooling-standards)."
---

# JavaScript/TypeScript Practices

How TypeScript packages are written in this codebase: modules, runtime access,
types and tests. Node runs the TypeScript source directly, and libraries reach
the runtime through the cross-runtime layer. React and browser UI are in
frontend-practices.

## Always

- Always import as a namespace (`import * as path from "@std/path"`), in code,
  tests, JSDoc `@example` blocks and READMEs alike; the only exceptions are
  `runtime` from `@eserstack/standards/cross-runtime`, type-only imports and the
  default import of a JSON or CSS module
- Import a package through its root, or in code and tests through a sub-path it
  publishes in `exports` when that keeps the module graph small; READMEs show
  the root, or `/mod` for a package whose `.` export is its CLI
- Named exports on the declaration; no default exports except where a framework
  loads a module's `default`
- Relative imports carry the `.ts` extension; a package's entry is `mod.ts`; no
  `export *`
- File system, env, process and exec access goes through `runtime`, never
  `process.*`, `node:fs` or another runtime's globals in library code
- Erasable syntax only: no enums, namespaces or parameter properties; exported
  declarations carry explicit types
- Only booleans use implicit checks; defaults use `??`, never `||`
- Where this codebase runs `validate-code-conventions`, it enforces the import,
  `||` and `export *` rules on new code against a baseline that only ever
  shrinks
- `null` for absent values you define; `instanceof` for object types
- `return await` in async functions; every promise is awaited or owned
- Tests are co-located `*.test.ts` files on `node:test`, with assertions and
  mocks from `@eserstack/test-kit`
- oxfmt, oxlint and `tsc --noEmit` enforce formatting, the basics and the types;
  run them instead of hand-checking

## References

| File                                                  | Read when                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| [modules.md](references/modules.md)                   | Adding imports or exports, creating a module or `mod.ts`         |
| [syntax-and-types.md](references/syntax-and-types.md) | Runtime APIs, paths, syntax, export types, checks, async returns |
| [testing.md](references/testing.md)                   | Writing or running TypeScript tests or benches                   |
