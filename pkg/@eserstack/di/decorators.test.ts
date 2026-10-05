// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as services from "./services.ts";
import * as decorators from "./decorators.ts";

@decorators.injectable()
// deno-lint-ignore no-unused-vars
class TestClass {
  testValue = "testing";
}

Deno.test("decorator", () => {
  const testClass = services.di`TestClass`;

  assert.assertStrictEquals(testClass.testValue, "testing");
});
