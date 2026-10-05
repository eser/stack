// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as container from "./container.ts";
import * as invoker from "./invoker.ts";

const create = () => {
  const registry = new container.Registry();

  const services = registry.build();

  return { registry, services };
};

Deno.test("basic", () => {
  const { registry, services } = create();

  let count = 0;

  registry.set("singleton", "value1");
  registry.setLazy("lazy", () => "value2");
  registry.setTransient("transient", () => `value${++count + 2}`);

  const result = invoker.invoke(services, (singleton, lazy, transient) => {
    return { singleton, lazy, transient };
  });

  assert.assertEquals(result, {
    singleton: "value1",
    lazy: "value2",
    transient: "value3",
  });
});
