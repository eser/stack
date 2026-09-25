# TypeScript Tests

Test mechanics for TypeScript packages. What to test and at which level is in
architecture-guidelines: What to Test.

---

## Test Files and Runner

Scope: Tests under `pkg/@eserstack/*`

Rule:

- Name test files `<module>.test.ts`, next to the module they test. A few older
  files use `_test.ts`; do not add more.
- Both `Deno.test` and `@std/testing/bdd` (`describe`/`it`) are in use. Follow
  the style of the existing tests in the package; a new package may pick either.
- Assert with `@std/assert`; test helpers and assertions are the named-import
  exception in modules.md: Imports.
- Match the package's runner (`Deno.test` or bdd), not its import style: test
  files use namespace imports like any other module.
- Run the suite with `deno task cli test` (defined in `.eser/manifest.yml`, with
  the permissions and coverage flags the repository uses). For one file,
  `deno test --allow-all path/to/file.test.ts`.
- Tests that touch files, env or processes go through `runtime` from
  `@eserstack/standards/cross-runtime` and clean up temporary directories they
  create.

Correct:

```typescript
import * as assert from "@std/assert";
import * as bdd from "@std/testing/bdd";
import * as slug from "./slug.ts";

bdd.describe("slug.toSlug", () => {
  bdd.it("lowercases and joins words with hyphens", () => {
    assert.assertEquals(slug.toSlug("Hello World"), "hello-world");
  });
});
```

**Why:** co-located `*.test.ts` files are what `deno test` discovers by default
and what reviewers look for next to a change.
