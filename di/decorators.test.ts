import { assert, bdd } from "../deps.ts";
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