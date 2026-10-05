---
name: javascript-practices
description: "TypeScript and JavaScript conventions of this codebase: namespace imports, mod.ts entries, cross-runtime access, explicit checks, async, co-located tests. Use when writing or reviewing .ts, .tsx or .js files (with frontend-practices for React UI), Deno.* or process.env in libraries, imports, truthy or null checks, or tests. Not for Deno config and dependencies (use tooling-standards)."
---

# JavaScript/TypeScript Practices

How TypeScript packages are written in this codebase: modules, runtime access,
types and tests. They run on Deno, Node and Bun alike through the cross-runtime
layer. React and browser UI are in frontend-practices.

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
- File system, env and process access goes through `runtime`, never `Deno.*` or
  `process.env` in library code
- Only booleans use implicit checks; defaults use `??`, never `||`
- Where this codebase runs `validate-code-conventions`, it enforces the import,
  `||` and `export *` rules on new code against a baseline that only ever
  shrinks
- `null` for absent values you define; `instanceof` for object types
- `return await` in async functions; every promise is awaited or owned
- Tests are co-located `*.test.ts`, run through this codebase's test script
- `deno fmt` and `deno lint` enforce formatting and the basics; run them instead
  of hand-checking

## References

| File                                                  | Read when                                                 |
| ----------------------------------------------------- | --------------------------------------------------------- |
| [modules.md](references/modules.md)                   | Adding imports or exports, creating a module or `mod.ts`  |
| [syntax-and-types.md](references/syntax-and-types.md) | Runtime APIs, paths, checks, conversions, async functions |
| [testing.md](references/testing.md)                   | Writing or running TypeScript tests                       |
