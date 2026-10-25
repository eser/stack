// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as flow from "./flow.ts";

nodeTest.test("flow with single function returns it as-is", () => {
  const double = flow.flow((x: number) => x * 2);
  assert.assertEquals(double(5), 10);
});

nodeTest.test("flow composes two functions left-to-right", () => {
  const doubleThenAdd = flow.flow(
    (x: number) => x * 2,
    (x: number) => x + 1,
  );
  assert.assertEquals(doubleThenAdd(5), 11);
});

nodeTest.test("flow composes multiple functions left-to-right", () => {
  const slug = flow.flow(
    (x: string) => x.toLowerCase(),
    (x: string) => x.split(" "),
    (x: string[]) => x.join("-"),
  );
  assert.assertEquals(slug("Hello World"), "hello-world");
});

nodeTest.test("flow handles type transformations across steps", () => {
  const process = flow.flow(
    (x: number) => String(x),
    (x: string) => x.length,
    (x: number) => x > 1,
  );
  assert.assertEquals(process(42), true);
  assert.assertEquals(process(5), false);
});

nodeTest.test(
  "flow is different from compose (left-to-right vs right-to-left)",
  () => {
    const addOneThenDouble = flow.flow(
      (x: number) => x + 1,
      (x: number) => x * 2,
    );
    // flow: (5 + 1) * 2 = 12
    assert.assertEquals(addOneThenDouble(5), 12);
  },
);

nodeTest.test("flow preserves function identity with single arg", () => {
  const identity = flow.flow((x: string) => x);
  assert.assertEquals(identity("test"), "test");
});

nodeTest.test("flow works with array transformations", () => {
  const sumSquares = flow.flow(
    (xs: number[]) => xs.map((x) => x * x),
    (xs: number[]) => xs.reduce((a, b) => a + b, 0),
  );
  assert.assertEquals(sumSquares([1, 2, 3]), 14);
});
