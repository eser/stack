# TypeScript Tests

Test mechanics for TypeScript packages. What to test and at which level is in
architecture-guidelines: What to Test.

## Contents

- Test Files and Runner
- Leaks and Process Exit
- Benches

---

## Test Files and Runner

Scope: TypeScript tests

Rule:

- Name test files `<module>.test.ts`, next to the module they test; never
  `_test.ts`. A test file is `.ts`, never `.tsx`: build React elements with
  `React.createElement` in it.
- Tests use `node:test`, imported as a namespace:
  `import * as nodeTest from "node:test"`, then `nodeTest.test`, or
  `nodeTest.describe` and `nodeTest.it` for grouped cases. Some files import the
  same module as `bdd`; in an existing file keep its alias and style.
- Assertions, test doubles and error capture come from `@eserstack/test-kit`
  (`/assert`, `/mock`, `/capture`), imported as namespaces, never from an
  assertion or mock library directly.
- Skip a test with the `skip` option and a reason string:
  `{ skip: !hasWasm && "the WASM build is missing; run make ajan-wasm" }`.
- Run the suite through the repository's test script (a `test` entry in
  `.eser/manifest.yml`, which carries the coverage, reporter and timeout
  flags). For one file, `node --test path/to/file.test.ts`.
- Tests that touch files, env or processes go through `runtime` from
  `@eserstack/standards/cross-runtime` and clean up temporary directories they
  create.

Correct:

```typescript
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as slug from "./slug.ts";

nodeTest.describe("slug.toSlug", () => {
  nodeTest.it("lowercases and joins words with hyphens", () => {
    assert.assertEquals(slug.toSlug("Hello World"), "hello-world");
  });
});
```

Incorrect:

```typescript
import { describe, it } from "node:test"; // named import
import * as assert from "node:assert"; // bypasses the test-kit seam
```

**Why:** co-located `*.test.ts` files are what the test script's glob finds and
what reviewers look for next to a change. Node strips types but does not
transform JSX, so `node --test` cannot load a `.tsx` file. The test-kit seam
keeps the assertion library behind one package, so replacing it changes that
package and not every test (ADR 0005).

---

## Leaks and Process Exit

Scope: Tests that start timers, servers, sockets or child processes

Rule: A test closes what it opens. To make a file fail on a leak, call
`leaks.checkLeaks()` from `@eserstack/test-kit/leaks` at the top of the file, or
inside a `describe` block for that suite only; it compares the active resources
before and after each test. Never add `--test-force-exit` to a test command.

Correct:

```typescript
import * as nodeTest from "node:test";
import * as leaks from "@eserstack/test-kit/leaks";

leaks.checkLeaks();

nodeTest.test("clears its timer", () => {
  const timer = setTimeout(() => {}, 1000);
  clearTimeout(timer);
});
```

**Why:** a file that keeps the event loop alive hangs until the timeout, which
is how the leak shows. `--test-force-exit` hides that hang and can end the
process before the reporters write their output (ADR 0005).

---

## Benches

Scope: `*.bench.ts` files

Rule: Benches use mitata, sit next to the module as `<module>.bench.ts`, and run
as plain scripts: `node path/to/file.bench.ts`, or this codebase's bench script
for all of them. They are not part of the gate.

Correct:

```typescript
import * as mitata from "mitata";
import * as chunk from "./chunk.ts";

const items = Array.from({ length: 1000 }, (_, index) => index);

mitata.bench("chunk 1000 items by 10", () => {
  chunk.chunk(items, 10);
});

// A bench file is a script: mitata.run() must finish before the process ends.
// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
```

**Why:** a bench measures time on one machine, so it is run on demand before
and after a change (coding-practices: Performance Claims Need Measurement), not as a pass or
fail step.
