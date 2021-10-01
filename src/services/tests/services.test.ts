import { asserts } from "./deps.ts";
import useServices from "../services.ts";

Deno.test("hex/services/services:use-services", () => {
  const [getService, setService] = useServices();
  const b = Symbol("b");

  setService("a", 5);
  setService(b, 6);
  setService("c", null);
  setService("d", undefined);

  asserts.assertEquals(getService("a"), 5);
  asserts.assertEquals(getService(b), 6);
  asserts.assertStrictEquals(getService("c"), null);
  asserts.assertStrictEquals(getService("d"), undefined);
  asserts.assertEquals(getService("e", "non-exists"), "non-exists");
});
