// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { Registry } from "./container.ts";
import { invoke } from "./invoker.ts";

const create = () => {
  const registry = new Registry();

  const services = registry.build();

  return { registry, services };
};

Deno.test("basic", () => {
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
