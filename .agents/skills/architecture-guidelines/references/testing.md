# Testing Strategy

What gets tested, at which level, with which runner, and how coverage is
tracked. Language details: javascript-practices and go-practices.

## Contents

- What to Test
- Runner, Files and Coverage
- Table-Driven Tests

---

## What to Test

Scope: All code changes

Rule:

- Business logic has unit tests that use fake adapters. Adapters have
  integration tests against the real dependency. Critical CLI and daemon flows
  get an end-to-end test.
- Tests cover failure paths (invalid input, missing file, timeout, dependency
  error) as well as the happy path.
- Assert observable behavior: return values, emitted output, state changes. A
  test that only checks a function was called, or still passes when the behavior
  breaks, is not a test.
- New code ships with its tests. A change never lowers the coverage of the
  packages it touches.
- A skipped test (`ignore: true`, `.skip`, `t.Skip`) carries a comment with the
  reason and a backlog task id.

Correct:

```typescript
import * as assert from "@std/assert";

const fakeRepo = {
  findUser: (id: string) => Promise.resolve({ id, name: "Test" }),
};

Deno.test("getUser returns the stored user", async () => {
  const service = createUserService(fakeRepo);
  const user = await service.getUser("test-id");
  assert.assertEquals(user.name, "Test");
});
```

Incorrect:

```typescript
// calculateDiscount ships with no test at all
export function calculateDiscount(price: number, percent: number): number {
  return price * (1 - percent / 100);
}
```

---

## Runner, Files and Coverage

Scope: TypeScript tests

Rule:

- Assertions come from `@std/assert`, imported as a namespace. Never add a
  second runner or assertion library (chai, `node:assert`, vitest).
- Both `Deno.test` and `@std/testing/bdd` (`describe`/`it`) are in use. In an
  existing file follow its style; do not mix the two in one file.
- Test files are co-located with the source as `*.test.ts`. Some older files use
  `_test.ts` (for example in `pkg/@eserstack/workflows`); leave them as they are
  unless asked, and name new files `*.test.ts`.
- Run tests with `deno task cli test`, which runs in parallel with
  `--trace-leaks` and writes coverage to `etc/coverage/`. `deno task cli ok`
  runs them as part of the precommit workflow. The Build workflow converts
  coverage to LCOV and uploads it to Codecov.

Because tests run in parallel in one process, a test that sets a process-wide
value (an environment variable, the working directory) races the others. Pass
the value as a parameter instead, or restore it in a `finally`.

---

## Table-Driven Tests

Scope: Unit tests with several input cases

Rule: Put the cases in a table and loop over it. Each case has a name that
describes the behavior, not the implementation. The Go form (subtests with
`t.Run`) is in go-practices.

Correct:

```typescript
import * as assert from "@std/assert";

const cases = [
  { name: "handles zero", input: 0, expected: "zero" },
  { name: "handles negative numbers", input: -1, expected: "negative" },
  { name: "handles positive numbers", input: 42, expected: "positive" },
];

for (const { name, input, expected } of cases) {
  Deno.test(name, () => {
    assert.assertEquals(classifyNumber(input), expected);
  });
}
```

Incorrect:

```typescript
Deno.test("test1", () => assert.assertEquals(classifyNumber(0), "zero"));
Deno.test("test2", () => assert.assertEquals(classifyNumber(-1), "negative"));
```
