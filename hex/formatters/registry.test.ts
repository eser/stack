import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { applicationJsonFormatter } from "./application-json.ts";
import { findByName, registry } from "./registry.ts";

bdd.describe("cool/hex/formatters/registry", () => {
  bdd.it("basic", () => {
    const formatters = [applicationJsonFormatter];
    const formatterRegistry = registry(formatters);

    assert.assertEquals([...formatterRegistry.items].length, 1);
  });

  bdd.it("find-by-name-functional", () => {
    const formatters = [applicationJsonFormatter];

    const jsonFormatter = findByName(formatters, "json");

    assert.assertStrictEquals(jsonFormatter, applicationJsonFormatter);
  });

  bdd.it("find-by-name-object-oriented", () => {
    const formatters = [applicationJsonFormatter];
    const formatterRegistry = registry(formatters);

    const jsonFormatter = formatterRegistry.findByName("json");

    assert.assertStrictEquals(jsonFormatter, applicationJsonFormatter);
  });
});
