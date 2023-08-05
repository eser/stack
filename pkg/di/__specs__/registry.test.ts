import { assert, bdd } from "./deps.ts";
import { useRegistry } from "../registry.ts";

bdd.describe("hex/di/registry", () => {
  bdd.it("registry:basic", () => {
    const [getService, serviceController] = useRegistry();

    serviceController.setValue("a", 5);

    assert.assertStrictEquals(getService("a"), 5);
  });

  bdd.it("basic", () => {
    const [getService, serviceController] = useRegistry();

    serviceController.setValue("a", 5);

    assert.assertStrictEquals(getService("a"), 5);
  });

  bdd.it("factory", () => {
    const [getService, serviceController] = useRegistry();

    let count = 55;

    const test = () => {
      return count++;
    };

    serviceController.setFactory("b", test);

    assert.assertStrictEquals(getService("b"), 55);
    assert.assertStrictEquals(getService("b"), 56);
  });

  bdd.it("empty", () => {
    const [getService] = useRegistry();

    assert.assertStrictEquals(getService("_"), undefined);
  });
});
