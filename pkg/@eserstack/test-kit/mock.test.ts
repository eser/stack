// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "./assert.ts";
import * as mock from "./mock.ts";

nodeTest.test("spy records calls and assertSpyCalls counts them", () => {
  const double = mock.spy((value: number) => value * 2);

  assert.assertEquals(double(21), 42);
  mock.assertSpyCalls(double, 1);
  assert.assertEquals(double.calls[0]?.args, [21]);
  assert.assertEquals(double.calls[0]?.returned, 42);

  const failing = mock.spy((): never => {
    throw new RangeError("no");
  });
  assert.assertThrows(() => failing(), RangeError);
  assert.assertInstanceOf(failing.calls[0]?.error, RangeError);

  const empty = mock.spy();
  empty("an argument");
  empty();
  mock.assertSpyCalls(empty, 2);
  assert.assertEquals(empty.calls[0]?.args, ["an argument"]);
  assert.assertStrictEquals(empty.calls[1]?.returned, undefined);

  assert.assertThrows(
    () => mock.assertSpyCalls(empty, 3),
    assert.AssertionError,
    "Spy not called as much as expected",
  );
  assert.assertThrows(
    () => mock.assertSpyCalls(empty, 1),
    assert.AssertionError,
    "Spy called more than expected",
  );
  assert.assertThrows(() => empty.restore(), Error, "plain function");
});

nodeTest.test("stub replaces a method until it is restored", () => {
  const target = { greet: (name: string): string => `hello ${name}` };
  const original = target.greet;
  const greet = mock.stub(target, "greet", (name) => `stubbed ${name}`);

  try {
    assert.assertEquals(target.greet("a"), "stubbed a");
    mock.assertSpyCalls(greet, 1);
    assert.assertEquals(greet.calls[0]?.args, ["a"]);
    assert.assertStrictEquals(greet.original, original);
    assert.assertFalse(greet.restored);
  } finally {
    greet.restore();
  }

  assert.assertEquals(target.greet("a"), "hello a");
  assert.assert(greet.restored);
  assert.assertThrows(() => greet.restore(), Error, "already restored");

  {
    using silent = mock.stub(target, "greet");
    assert.assertStrictEquals(target.greet("b"), undefined);
    mock.assertSpyCalls(silent, 1);
  }

  assert.assertEquals(target.greet("c"), "hello c");
});
