# TypeScript Tests

Test mechanics for TypeScript packages. What to test and at which level is in
architecture-guidelines: What to Test.

---

## Test Files and Runner

Scope: TypeScript tests

Rule:

- Name test files `<module>.test.ts`, next to the module they test; never
  `_test.ts`.
- Both `Deno.test` and `@std/testing/bdd` (`describe`/`it`) are fine. Follow the
  style of the existing tests in the package; a new package may pick either.
- Assert with `@std/assert`, imported as a namespace like everything else.
- Match the package's runner (`Deno.test` or bdd), not its import style: test
  files use namespace imports like any other module.
- Run the suite through the repository's test script (a `test` entry in
  `.eser/manifest.yml`, which carries the permissions and coverage flags). For
  one file, `deno test --allow-all path/to/file.test.ts`.
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
