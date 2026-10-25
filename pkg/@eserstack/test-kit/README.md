# 🧪 [@eserstack/test-kit](./)

`@eserstack/test-kit` is the one place the repository's tests get their
assertions and test doubles from (decision-3). It is private: it is never
published, and it depends on no `@eserstack/*` package, so every package,
`@eserstack/standards` and `@eserstack/primitives` included, can list it as a
devDependency without a cycle.

Today each module re-exports the `@std/assert` and `@std/testing/mock` functions
the tests use. M2-T4 moves them to `node:assert` in this package only.

## Assertions

```typescript
import * as assert from "@eserstack/test-kit/assert";

assert.assertEquals({ a: 1 }, { a: 1 });
assert.assertStringIncludes("hello world", "world");
```

## Test doubles

```typescript
import * as mock from "@eserstack/test-kit/mock";

const onSave = mock.spy((value: number) => value * 2);
onSave(21);
mock.assertSpyCalls(onSave, 1);
```

## Capturing errors

`captureThrow` and `captureRejection` return what the code throws or rejects
with, for tests that check the error afterwards:

```typescript
import * as assert from "@eserstack/test-kit/assert";
import * as capture from "@eserstack/test-kit/capture";

const error = capture.captureThrow(() => JSON.parse("{"));
assert.assertInstanceOf(error, SyntaxError);

const reason = await capture.captureRejection(() =>
  Promise.reject(new RangeError("too far"))
);
assert.assertInstanceOf(reason, RangeError);
```

Both fail the test with an `AssertionError` when nothing is thrown.
