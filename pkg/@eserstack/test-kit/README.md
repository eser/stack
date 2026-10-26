# 🧪 [@eserstack/test-kit](./)

`@eserstack/test-kit` is the one place the repository's tests get their
assertions and test doubles from (decision-3). It is private: it is never
published, and it depends on no `@eserstack/*` package, so every package,
`@eserstack/standards` and `@eserstack/primitives` included, can list it as a
devDependency without a cycle. It has no dependencies at all: the assertions
run on `node:assert/strict` and the test doubles on the `node:test` mock, under
the names and signatures the tests took from `@std/assert` and
`@std/testing/mock` before.

## Assertions

```typescript
import * as assert from "@eserstack/test-kit/assert";

assert.assertEquals({ a: 1 }, { a: 1 });
assert.assertStringIncludes("hello world", "world");

const error = assert.assertThrows(() => JSON.parse("{"), SyntaxError, "JSON");
```

`assertEquals` and `assertNotEquals` use Node's strict deep equality
(`deepStrictEqual`). It compares prototypes, so a null-prototype object, such
as a table that `smol-toml` parses, does not equal a `{}` literal; build the
expected value with `Object.create(null)` instead. It also tells `-0` from `0`.

`assertThrows` and `assertRejects` return the error. Given a class, they check
that the error is an instance of it and that its message includes the optional
text, and the result is typed as that class. `assertExists`,
`assertInstanceOf`, `assertStrictEquals` and `assertFalse` narrow the checked
value. Every failure is a `node:assert` `AssertionError`.

## Test doubles

```typescript
import * as mock from "@eserstack/test-kit/mock";

const onSave = mock.spy((value: number) => value * 2);
onSave(21);
mock.assertSpyCalls(onSave, 1);

const target = { greet: (name: string): string => `hello ${name}` };
{
  using greet = mock.stub(target, "greet", (name) => `hi ${name}`);
  target.greet("Ada");
  mock.assertSpyCalls(greet, 1);
}
```

`spy` records calls through `mock.fn` and `stub` replaces a method through
`mock.method`. Each call is in `calls` as `{ args, returned, error, self }`. A
stub puts the method back on `restore()` or at the end of a `using` block. A
stub can only replace a property that holds a function.

## Capturing errors

`captureThrow` and `captureRejection` return what the code throws or rejects
with, for tests that check the error afterwards:

```typescript
import * as assert from "@eserstack/test-kit/assert";
import * as capture from "@eserstack/test-kit/capture";

const error = capture.captureThrow(() => JSON.parse("{"));
assert.assertInstanceOf(error, SyntaxError);

const reason = await capture.captureRejection(() =>
  Promise.reject(new RangeError("too far")),
);
assert.assertInstanceOf(reason, RangeError);
```

Both fail the test with an `AssertionError` when nothing is thrown.

## Checking for leaked resources

`checkLeaks` fails each test that ends with more active resources than it
started with, such as a timer it never cleared or a server it never closed. It
compares `process.getActiveResourcesInfo()` before and after each test, so it
runs on Node only. Call it at the top of a file, or inside a `describe` block
to check that suite only:

```typescript
import * as nodeTest from "node:test";
import * as leaks from "@eserstack/test-kit/leaks";

leaks.checkLeaks();

nodeTest.test("clears its timer", () => {
  const timer = setTimeout(() => {}, 1000);
  clearTimeout(timer);
});
```

A test that leaks fails with a message such as
`the test leaked active resources: Timeout (+1)`.
