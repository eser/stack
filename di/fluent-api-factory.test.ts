import { assert, bdd } from "../deps.ts";
import { Registry } from "./container.ts";
import { factory } from "./fluent-api-factory.ts";

const create = () => {
  const registry = new Registry();

  const services = registry.build();

  const di = factory(services);

  return { di, registry, services };
};

bdd.describe("cool/di/services", () => {
  bdd.it("non-existent key", () => {
    const { di } = create();

    assert.assertStrictEquals(di`_`, undefined);
  });

  bdd.it("singleton value", () => {
    const { di } = create();

    di.register("b", "value");

    assert.assertStrictEquals(di`b`, "value");
  });
});
