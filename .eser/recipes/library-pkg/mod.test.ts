// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as primitives from "@eserstack/primitives";
import * as mod from "./mod.ts";

nodeTest.test("greet returns a greeting for a name", () => {
  const result = mod.greet(" World ");

  assert.assert(primitives.results.isOk(result));
  assert.assertEquals(result.value, "Hello, World!");
});

nodeTest.test("greet fails for an empty name", () => {
  const result = mod.greet("  ");

  assert.assert(primitives.results.isFail(result));
  assert.assertEquals(result.error.message, "name is empty");
});
