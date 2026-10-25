// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as container from "./container.ts";
import * as invoker from "./invoker.ts";

const create = () => {
  const registry = new container.Registry();

  const services = registry.build();

  return { registry, services };
};

nodeTest.test("basic", () => {
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

nodeTest.test("arrow function without parentheses", () => {
  const { registry, services } = create();

  registry.set("singleton", "value1");

  // Node's type stripping keeps the source text, so `fn.toString()` returns
  // the arrow exactly as written here.
  // oxfmt-ignore
  const result = invoker.invoke(services, singleton => singleton);

  assert.assertEquals(result, "value1");
});

nodeTest.test("async arrow function without parentheses", async () => {
  const { registry, services } = create();

  registry.set("singleton", "value1");

  // The arrow is async to check the `async` keyword is skipped; it has
  // nothing to await.
  // oxfmt-ignore
  // oxlint-disable-next-line require-await
  const result = await invoker.invoke(services, async singleton => singleton);

  assert.assertEquals(result, "value1");
});
