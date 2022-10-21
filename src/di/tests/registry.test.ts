import { asserts, bdd } from "./deps.ts";
import { useRegistry } from "../registry.ts";

bdd.describe("hex/di/registry", () => {
  bdd.it("registry:basic", () => {
    const [getService, serviceController] = useRegistry();

    serviceController.setValue("a", 5);

    asserts.assertStrictEquals(getService("a"), 5);
  });

  bdd.it("basic", () => {
    const [getService, serviceController] = useRegistry();

    serviceController.setValue("a", 5);

    asserts.assertStrictEquals(getService("a"), 5);
  });

  bdd.it("factory", () => {
    const [getService, serviceController] = useRegistry();

    let count = 55;

    function test() {
      return count++;
    }

    serviceController.setFactory("b", test);

    asserts.assertStrictEquals(getService("b"), 55);
    asserts.assertStrictEquals(getService("b"), 56);
  });

  bdd.it("empty", () => {
    const [getService] = useRegistry();

    asserts.assertStrictEquals(getService("_"), undefined);
  });
});
