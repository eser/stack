// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";
import { Registry } from "./container.ts";
import { invoke } from "./invoker.ts";

const create = () => {
  const registry = new Registry();

  const services = registry.build();

  return { registry, services };
};

bdd.describe("cool/di/invoker", () => {
  bdd.it("basic", () => {
    const { registry, services } = create();

    let count = 0;

    registry.set("singleton", "value1");
    registry.setLazy("lazy", () => "value2");
    registry.setTransient("transient", () => `value${++count + 2}`);

    const result = invoke(services, (singleton, lazy, transient) => {
      return { singleton, lazy, transient };
    });

    assert.assertEquals(result, {
      singleton: "value1",
      lazy: "value2",
      transient: "value3",
    });
  });
});
