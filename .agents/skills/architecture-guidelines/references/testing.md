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
- A skipped test (the `skip` option in TypeScript, `t.Skip` in Go) carries the
  reason and a backlog task id, in the skip message or a comment next to it. A
  skip that depends on the environment (a platform, a missing build) names that
  condition in its message instead.

Correct:

```typescript
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";

const fakeRepo = {
  findUser: (id: string) => Promise.resolve({ id, name: "Test" }),
};

nodeTest.test("getUser returns the stored user", async () => {
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

- Tests run on `node:test`. Assertions and test doubles come from
  `@eserstack/test-kit`, imported as namespaces. Never add a third-party runner
  or assertion library (vitest, jest, chai).
- Test files are co-located with the source as `*.test.ts`.
- Run tests through this codebase's test command (the manifest script its
  AGENTS.md names), with coverage on, and as part of the precommit gate. CI
  uploads the LCOV report so a drop is visible in review.

`node --test` runs each test file in its own process, several files at a time,
and the tests of one file in order. A process-wide value (an environment
variable, the working directory) set in one file never reaches another, but it
stays set for every later test in the same file. Pass the value as a parameter
instead, or restore it in a `finally`.

**Why:** `node:test` ships with Node, so the tests need no runner dependency,
and the test-kit seam lets the assertion library change in one package
(ADR 0005).

---

## Table-Driven Tests

Scope: Unit tests with several input cases

Rule: Put the cases in a table and loop over it. Each case has a name that
describes the behavior, not the implementation. The Go form (subtests with
`t.Run`) is in go-practices.

Correct:

```typescript
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";

const cases = [
  { name: "handles zero", input: 0, expected: "zero" },
  { name: "handles negative numbers", input: -1, expected: "negative" },
  { name: "handles positive numbers", input: 42, expected: "positive" },
];

for (const { name, input, expected } of cases) {
  nodeTest.test(name, () => {
    assert.assertEquals(classifyNumber(input), expected);
  });
}
```

Incorrect:

```typescript
nodeTest.test("test1", () => assert.assertEquals(classifyNumber(0), "zero"));
nodeTest.test("test2", () =>
  assert.assertEquals(classifyNumber(-1), "negative"),
);
```
