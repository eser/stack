import { asserts } from "./deps.ts";
import useServices from "../services.ts";

Deno.test("hex/services/services:basic", () => {
  const [getService, serviceController] = useServices();

  serviceController.setValue("a", 5);

  asserts.assertStrictEquals(getService("a"), 5);
});

Deno.test("hex/services/services:empty", () => {
  const [getService] = useServices();

  asserts.assertStrictEquals(getService("_"), undefined);
});
