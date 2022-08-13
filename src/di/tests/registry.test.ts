import { asserts } from "./deps.ts";
import { useRegistry } from "../registry.ts";

Deno.test("hex/di/registry:basic", () => {
  const [getService, serviceController] = useRegistry();

  serviceController.setValue("a", 5);

  asserts.assertStrictEquals(getService("a"), 5);
});

Deno.test("hex/di/registry:factory", () => {
  const [getService, serviceController] = useRegistry();

  let count = 55;

  function test() {
    return count++;
  }

  serviceController.setFactory("b", test);

  asserts.assertStrictEquals(getService("b"), 55);
  asserts.assertStrictEquals(getService("b"), 56);
});

Deno.test("hex/di/registry:empty", () => {
  const [getService] = useRegistry();

  asserts.assertStrictEquals(getService("_"), undefined);
});
