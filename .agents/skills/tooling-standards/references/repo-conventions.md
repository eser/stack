# Repository Conventions

File naming, license headers and new workspace packages, as the `eser`
validators enforce them in every repository that uses the toolchain.

---

## File Naming

Scope: Every file in the repository

Rule: Files are kebab-case (`http-client.test.ts`, `parse-args.bench.ts`,
`user-profile.tsx`); components are kebab-case too, never PascalCase. Go code is
snake_case (`session_store.go`) in the directories the repository lists as Go
paths. The `validate-filenames` step in `.eser/manifest.yml` enforces both, and
its config is where the Go paths are listed. `.agents/` is excluded because
`SKILL.md` is a fixed name.

**Why:** one casing rule avoids case-only renames that break on case-insensitive
file systems, which `validate-case-conflict` also guards.

---

## License Headers

Scope: Every `.ts`, `.tsx` and `.go` source file

Rule: The first line is the license header:

```typescript
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
```

Copy it from an existing file; never retype it. `validate-licenses` checks it,
and `--fix` inserts missing headers.

---

## Adding a Workspace Package

Scope: Creating a new package in the workspace

Rule:

1. Start from the library recipe in `.eser/recipes/` (the repository's
   `AGENTS.md` names it).
2. Write `package.json` with the name, `type: module`, exports and `workspace:*`
   internal dependencies. Do not write `deno.json` by hand.
3. Give every source file the license header. `mod.ts` is the entry point and
   re-exports submodules as namespaces
   (`export * as results from
   "./results.ts"`); a CLI's entry point is
   `main.ts`; there is no `index.ts`.
4. Add `mod.test.ts` and a README (documentation-conventions: Package README
   Structure).
5. Run `pnpm install` at the root to link it, then the full gate
   (`deno task cli ok`), which regenerates `deno.json` and validates everything.
