// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "./assert.ts";
import * as mock from "./mock.ts";

Deno.test("spy records calls and assertSpyCalls counts them", () => {
  const double = mock.spy((value: number) => value * 2);

  assert.assertEquals(double(21), 42);
  mock.assertSpyCalls(double, 1);
});

Deno.test("stub replaces a method until it is restored", () => {
  const target = { greet: (): string => "hello" };
  const greet = mock.stub(target, "greet", () => "stubbed");

  try {
    assert.assertEquals(target.greet(), "stubbed");
    mock.assertSpyCalls(greet, 1);
  } finally {
    greet.restore();
  }

  assert.assertEquals(target.greet(), "hello");
});
