// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "./assert.ts";
import * as capture from "./capture.ts";

nodeTest.test("captureThrow returns the thrown error", () => {
  const error = capture.captureThrow(() => JSON.parse("{"));

  assert.assertInstanceOf(error, SyntaxError);
});

nodeTest.test(
  "captureThrow returns a thrown value that is not an Error",
  () => {
    const thrown = { code: "E_PLAIN" };

    assert.assertStrictEquals(
      capture.captureThrow(() => {
        throw thrown;
      }),
      thrown,
    );
  },
);

nodeTest.test("captureThrow fails when nothing is thrown", () => {
  let failure: unknown = null;
  try {
    capture.captureThrow(() => 1);
  } catch (error) {
    failure = error;
  }

  assert.assertInstanceOf(failure, assert.AssertionError);
});

nodeTest.test("captureRejection returns the rejection reason", async () => {
  const error = await capture.captureRejection(() =>
    Promise.reject(new RangeError("too far")),
  );

  assert.assertInstanceOf(error, RangeError);
  assert.assertEquals((error as Error).message, "too far");
});

nodeTest.test("captureRejection fails when the promise resolves", async () => {
  let failure: unknown = null;
  try {
    await capture.captureRejection(() => Promise.resolve(1));
  } catch (error) {
    failure = error;
  }

  assert.assertInstanceOf(failure, assert.AssertionError);
});
