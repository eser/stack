// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, bdd } from "./deps-dev.ts";
import { di } from "./services.ts";
import { injectable } from "./decorators.ts";

@injectable()
// deno-lint-ignore no-unused-vars
class TestClass {
  testValue = "testing";
}

bdd.describe("cool/di/decorators", () => {
  bdd.it("decorator", () => {
    const testClass = di`TestClass`;

    assert.assertStrictEquals(testClass.testValue, "testing");
  });
});
