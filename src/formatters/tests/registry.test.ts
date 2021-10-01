import { asserts } from "./deps.ts";
import applicationJsonFormatter from "../application-json.ts";
import registry, { findByName } from "../registry.ts";

Deno.test("hex/formatters/registry:basic", () => {
  const formatters = [applicationJsonFormatter];
  const formatterRegistry = registry(formatters);

  asserts.assertEquals([...formatterRegistry.items].length, 1);
});

Deno.test("hex/formatters/registry:find-by-name-functional", () => {
  const formatters = [applicationJsonFormatter];

  const jsonFormatter = findByName(formatters, "json");

  asserts.assertStrictEquals(jsonFormatter, applicationJsonFormatter);
});

Deno.test("hex/formatters/registry:find-by-name-object-oriented", () => {
  const formatters = [applicationJsonFormatter];
  const formatterRegistry = registry(formatters);

  const jsonFormatter = formatterRegistry.findByName("json");

  asserts.assertStrictEquals(jsonFormatter, applicationJsonFormatter);
});
