---
name: javascript-practices
description: "TS and JS conventions for eserstack packages: namespace imports, mod.ts entries, cross-runtime APIs, explicit checks, async, tests and laroux React components. Use when writing or reviewing .ts, .tsx or .js files, Deno.* or process.env use in libraries, imports, truthy or null checks flagged in review, tests or React UI. Not for Deno config or dependencies (use tooling-standards)."
---

# JavaScript/TypeScript Practices

How TypeScript is written in `pkg/@eserstack/*`: modules, runtime access, types,
tests and React UI.

## Always

- Always import as a namespace (`import * as path from "@std/path"`), in code,
  tests, JSDoc `@example` blocks and READMEs alike; the only exception is
  `runtime` from `@eserstack/standards/cross-runtime`
- Named exports on the declaration; no default exports except where laroux loads
  a module's `default`
- Relative imports carry the `.ts` extension; a package's entry is `mod.ts`; no
  `export *`
- File system, env and process access goes through `runtime`, never `Deno.*` or
  `process.env` in library code
- Only booleans use implicit checks; defaults use `??`, never `||`
- `validate-code-conventions` (in `deno task cli ok`) enforces the import and
  `||` rules on new code; existing violations sit in
  `.eser/baselines/code-conventions.json`, which only ever shrinks
- `null` for absent values you define; `instanceof` for object types
- `return await` in async functions; every promise is awaited or owned
- Tests are co-located `*.test.ts`, run with `deno task cli test`
- `deno fmt` and `deno lint` enforce formatting and the basics; run them instead
  of hand-checking

## References

| File                                                  | Read when                                                 |
| ----------------------------------------------------- | --------------------------------------------------------- |
| [modules.md](references/modules.md)                   | Adding imports or exports, creating a module or `mod.ts`  |
| [syntax-and-types.md](references/syntax-and-types.md) | Runtime APIs, paths, checks, conversions, async functions |
| [testing.md](references/testing.md)                   | Writing or running TypeScript tests                       |
| [react.md](references/react.md)                       | Building React components, styles or UI states            |
