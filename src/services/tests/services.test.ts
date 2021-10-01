import { asserts } from "./deps.ts";
import useServices from "../services.ts";

Deno.test("hex/services/services:basic", () => {
  const [getService, serviceController] = useServices();

  serviceController.setValue("a", 5);

  asserts.assertEquals(getService("a"), 5);
});

Deno.test("hex/services/services:with symbols", () => {
  const [getService, serviceController] = useServices();
  const b = Symbol("b");

  serviceController.setValue(b, 6);

  asserts.assertEquals(getService(b), 6);
});

Deno.test("hex/services/services:with nullables", () => {
  const [getService, serviceController] = useServices();

  serviceController.setValue("c", null);
  serviceController.setValue("d", undefined);

  asserts.assertStrictEquals(getService("c"), null);
  asserts.assertStrictEquals(getService("d"), undefined);
  asserts.assertEquals(getService("e", "non-exists"), "non-exists");
  asserts.assertStrictEquals(getService("f"), undefined);
});

Deno.test("hex/services/services:with factory", () => {
  const [getService, serviceController] = useServices();

  let number = 1;
  serviceController.setFactory("g", () => number++);

  asserts.assertStrictEquals(getService("g"), 1);
  asserts.assertStrictEquals(getService("g"), 2);
  asserts.assertStrictEquals(getService("g"), 3);
});
