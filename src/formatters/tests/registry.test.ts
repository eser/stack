import { asserts } from "./deps.ts";
import applicationJsonFormatter from "../application-json.ts";
import registry from "../registry.ts";

Deno.test("hex/formatters/registry:basic", () => {
  const formatters = [applicationJsonFormatter];
  const formatterRegistry = registry(formatters);

  asserts.assertEquals([...formatterRegistry.items].length, 1);
});

Deno.test("hex/formatters/registry:findByName", () => {
  const formatters = [applicationJsonFormatter];
  const formatterRegistry = registry(formatters);

  const jsonFormatter = formatterRegistry.findByName("json");

  asserts.assertStrictEquals(jsonFormatter, applicationJsonFormatter);
});
