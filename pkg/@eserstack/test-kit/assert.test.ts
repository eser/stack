// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeAssert from "node:assert/strict";
import * as nodeTest from "node:test";
import * as assert from "./assert.ts";

/** Runs `fn` and returns the AssertionError it throws, without test-kit. */
const failureOf = (fn: () => unknown): nodeAssert.AssertionError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof nodeAssert.AssertionError) {
      return error;
    }

    throw error;
  }

  throw new Error("expected an AssertionError");
};

/** Awaits `fn()` and returns the AssertionError it rejects with. */
const rejectionOf = async (
  fn: () => Promise<unknown>,
): Promise<nodeAssert.AssertionError> => {
  try {
    await fn();
  } catch (error) {
    if (error instanceof nodeAssert.AssertionError) {
      return error;
    }

    throw error;
  }

  throw new Error("expected an AssertionError");
};

/** A thrown value that is not an Error. */
const plainValue = { code: "E_PLAIN" };

class NotFound extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`no entry for ${key}`);
    this.key = key;
  }
}

nodeTest.test(
  "the assertions pass and fail on node:assert like the @std/assert names they keep",
  async () => {
    assert.assertEquals({ a: [1, 2] }, { a: [1, 2] });
    assert.assertStrictEquals(1, 1);
    assert.assertStringIncludes("hello world", "world");
    assert.assertMatch("abc", /b/);
    assert.assertArrayIncludes([1, 2, 3], [2]);
    assert.assertArrayIncludes([{ id: 1 }, { id: 2 }], [{ id: 2 }]);
    assert.assertObjectMatch({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 2 } });
    assert.assertExists(0);
    assert.assertFalse(false);
    assert.assertGreater(2, 1);
    assert.assertLess(1, 2);
    assert.assertNotEquals({ a: 1 }, { a: 2 });
    assert.assertNotStrictEquals({}, {});

    // Equality is strict deep equality: prototypes and -0 count.
    failureOf(() => assert.assertEquals(Object.create(null), {}));
    failureOf(() => assert.assertEquals(-0, 0));
    failureOf(() =>
      assert.assertEquals(new Map([[1, "a"]]), new Map([[1, "b"]])),
    );
    nodeAssert.match(
      failureOf(() => assert.assertEquals(1, 2, "the count")).message,
      /^the count\nExpected values to be strictly deep-equal/,
    );

    failureOf(() => assert.assert(0));
    failureOf(() => assert.assertFalse(1));
    failureOf(() => assert.assertExists(null));
    failureOf(() => assert.assertExists(undefined));
    failureOf(() => assert.assertInstanceOf({}, NotFound));
    failureOf(() => assert.assertStringIncludes("abc", "d"));
    failureOf(() => assert.assertArrayIncludes([{ id: 1 }], [{ id: 2 }]));
    failureOf(() => assert.assertObjectMatch({ a: 1 }, { a: 2 }));
    failureOf(() => assert.assertGreater(1, 1));
    failureOf(() => assert.assertLess(1, 1));
    nodeAssert.equal(
      failureOf(() => assert.fail("stop")).message,
      "Failed assertion: stop",
    );

    const value: string | null = Math.random() < 2 ? "set" : null;
    assert.assertExists(value);
    nodeAssert.equal(value.length, 3);

    const thrownByUnknown: unknown = new NotFound("a");
    assert.assertInstanceOf(thrownByUnknown, NotFound);
    nodeAssert.equal(thrownByUnknown.key, "a");

    // assertThrows returns the error, typed by the class it checks.
    const error = assert.assertThrows(
      () => {
        throw new NotFound("b");
      },
      NotFound,
      "no entry",
    );
    nodeAssert.equal(error.key, "b");
    nodeAssert.equal(
      assert.assertThrows(() => {
        throw plainValue;
      }),
      plainValue,
    );
    nodeAssert.match(
      failureOf(() => assert.assertThrows(() => 1)).message,
      /to throw/,
    );
    nodeAssert.match(
      failureOf(() =>
        assert.assertThrows(() => {
          throw new RangeError("x");
        }, NotFound),
      ).message,
      /instance of "NotFound", but was "RangeError"/,
    );
    nodeAssert.match(
      failureOf(() =>
        assert.assertThrows(
          () => {
            throw new NotFound("c");
          },
          NotFound,
          "missing",
        ),
      ).message,
      /to include "missing"/,
    );
    nodeAssert.match(
      failureOf(() =>
        assert.assertThrows(() => {
          throw plainValue;
        }, Error),
      ).message,
      /non-Error object was thrown/,
    );

    // assertRejects returns the error and needs a promise.
    const rejected = await assert.assertRejects(
      () => Promise.reject(new NotFound("d")),
      NotFound,
      "for d",
    );
    nodeAssert.equal(rejected.key, "d");
    nodeAssert.equal(await assert.assertRejects(() => Promise.reject(7)), 7);
    nodeAssert.match(
      (await rejectionOf(() => assert.assertRejects(() => Promise.resolve(1))))
        .message,
      /to reject/,
    );
    nodeAssert.match(
      (
        await rejectionOf(() =>
          assert.assertRejects(() => {
            throw new NotFound("e");
          }),
        )
      ).message,
      /throws when expected to reject/,
    );
    nodeAssert.match(
      (
        await rejectionOf(() =>
          assert.assertRejects(
            () => Promise.reject(new RangeError("x")),
            NotFound,
          ),
        )
      ).message,
      /instance of "NotFound"/,
    );

    nodeAssert.ok(
      failureOf(() => assert.assertEquals(1, 2)) instanceof
        assert.AssertionError,
    );
  },
);
