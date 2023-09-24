import { assert, bdd, mock } from "../deps.ts";
import { Registry } from "./container.ts";
import { factory } from "./fluent-api-factory.ts";

const create = () => {
  const registry = new Registry();

  const services = registry.build();

  const di = factory(services);

  return { di, registry, services };
};

bdd.describe("cool/di/fluent-api-factory", () => {
  bdd.it("di template strings: non-existent key", () => {
    const { di } = create();

    assert.assertStrictEquals(di`_`, undefined);
  });

  bdd.it("di template strings: singleton value", () => {
    const { di } = create();

    di.register("a", "value");

    assert.assertStrictEquals(di`a`, "value");
  });

  bdd.it("di template strings: literals", () => {
    const { di } = create();

    di.register("b", "c2");
    di.register("d", "e4");

    assert.assertStrictEquals(di`${"b"} = ${"d"}.`, "c2 = e4.");
  });

  bdd.it("di.many()", () => {
    const { di } = create();

    di.register("f", "h3");
    di.register("g", "i5");

    assert.assertEquals(di.many("f", "g"), ["h3", "i5"]);
  });

  bdd.it("di.invoke()", () => {
    const { di } = create();

    di.register("j", mock.spy());
    di.register("k", mock.spy());
    di.register("l", mock.spy());

    const fn = (j: () => void, k: () => void, l: () => void) => {
      j();
      k();
      k();
      l();
      l();
      l();
    };

    di.invoke(fn);

    mock.assertSpyCalls(di`j`, 1);
    mock.assertSpyCalls(di`k`, 2);
    mock.assertSpyCalls(di`l`, 3);
  });
});
