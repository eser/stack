// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as services from "./services.ts";
import * as decorators from "./decorators.ts";

class TestClass {
  testValue = "testing";
}
decorators.injectable()(TestClass);

nodeTest.test("decorator", () => {
  const testClass = services.di`TestClass`;

  assert.assertStrictEquals(testClass.testValue, "testing");
});
