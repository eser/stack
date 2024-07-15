// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as mock from "@std/testing/mock";
import { Registry } from "./container.ts";

Deno.test("non-existent key", () => {
  const registry = new Registry();

  const container = registry.build();

  assert.assertStrictEquals(container.get("_"), undefined);
});

Deno.test("symbol key", () => {
  const registry = new Registry();
  const a = Symbol("a");

  registry.set(a, 6);

  const container = registry.build();

  assert.assertStrictEquals(container.get(a), 6);
});

Deno.test("mixed keys", () => {
  const registry = new Registry();

  registry.set(Object.keys, "Object.keys method");
  registry.set(Object.values, "Object.values method");
  registry.set(Object.entries, "Object.entries method");

  const container = registry.build();

  assert.assertStrictEquals(container.get(Object.keys), "Object.keys method");
  assert.assertStrictEquals(
    container.get(Object.values),
    "Object.values method",
  );
  assert.assertStrictEquals(
    container.get(Object.entries),
    "Object.entries method",
  );
});

Deno.test("singleton value", () => {
  const registry = new Registry();

  registry.set("b", 5);

  const container = registry.build();

  assert.assertStrictEquals(container.get("b"), 5);
});

Deno.test("singleton nullables", () => {
  const registry = new Registry();

  registry.set("c", null);
  registry.set("d", undefined);

  const container = registry.build();

  assert.assertStrictEquals(container.get("c"), null);
  assert.assertStrictEquals(container.get("d"), undefined);
  assert.assertStrictEquals(container.get("e", "non-exists"), "non-exists");
  assert.assertStrictEquals(container.get("f"), undefined);
});

Deno.test("singleton functions", () => {
  const registry = new Registry();

  registry.set("g", (x: number) => x + 3);

  const container = registry.build();

  const result = container.get("g");

  assert.assertStrictEquals(result.constructor, Function);
  assert.assertStrictEquals(result(5), 8);
});

Deno.test("lazy value", () => {
  const registry = new Registry();

  const spyFn = mock.spy();

  let number = 1;
  registry.setLazy("h", () => {
    spyFn();
    return ++number;
  });

  const container = registry.build();

  assert.assertStrictEquals(number, 1);
  assert.assertStrictEquals(container.get("h"), 2);
  assert.assertStrictEquals(number, 2);

  mock.assertSpyCalls(spyFn, 1);
});

Deno.test("lazy nullable", () => {
  const registry = new Registry();

  const iSpyFn = mock.spy();
  const jSpyFn = mock.spy();

  registry.setLazy("i", () => {
    iSpyFn();
    return null;
  });

  registry.setLazy("j", () => {
    jSpyFn();
    return undefined;
  });

  const container = registry.build();

  assert.assertStrictEquals(container.get("i"), null);
  assert.assertStrictEquals(container.get("j"), undefined);

  mock.assertSpyCalls(iSpyFn, 1);
  mock.assertSpyCalls(jSpyFn, 1);
});

Deno.test("scoped value", () => {
  const registry = new Registry();

  const kSpyFn = mock.spy();
  const lSpyFn = mock.spy();

  let number = 1;
  registry.setLazy("k", () => {
    kSpyFn();
    return ++number;
  });
  registry.setScoped("l", () => {
    lSpyFn();
    return ++number;
  });

  const container = registry.build();
  const subScope = container.createScope();

  assert.assertStrictEquals(number, 1);
  assert.assertStrictEquals(container.get("k"), 2);
  assert.assertStrictEquals(container.get("k"), 2);
  assert.assertStrictEquals(container.get("l"), 3);
  assert.assertStrictEquals(container.get("l"), 3);
  assert.assertStrictEquals(subScope.get("k"), 2);
  assert.assertStrictEquals(subScope.get("k"), 2);
  assert.assertStrictEquals(subScope.get("l"), 4);
  assert.assertStrictEquals(subScope.get("l"), 4);
  assert.assertStrictEquals(container.get("l"), 3);
  assert.assertStrictEquals(number, 4);

  mock.assertSpyCalls(kSpyFn, 1);
  mock.assertSpyCalls(lSpyFn, 2);
});

Deno.test("transient functions", () => {
  const registry = new Registry();

  let number = 1;
  registry.setTransient("m", () => number++);

  const container = registry.build();

  assert.assertStrictEquals(container.get("m"), 1);
  assert.assertStrictEquals(container.get("m"), 2);
  assert.assertStrictEquals(container.get("m"), 3);
});

Deno.test("transient promise", async () => {
  const registry = new Registry();

  registry.setTransient("n", () => Promise.resolve("test"));

  const container = registry.build();

  assert.assertStrictEquals(await container.get("n"), "test");
});

Deno.test("getMany", () => {
  const registry = new Registry();

  const lazySpyFn = mock.spy();
  const transientSpyFn = mock.spy();

  let number = 1;
  registry.set("o", number);
  registry.setLazy("p", () => {
    lazySpyFn();
    return ++number;
  });
  registry.setTransient("q", () => {
    transientSpyFn();
    return ++number;
  });

  const container = registry.build();

  assert.assertStrictEquals(number, 1);

  const [o, p, q, r, s] = container.getMany("o", "p", "q", "q", "s");

  assert.assertStrictEquals(number, 4);
  assert.assertStrictEquals(o, 1);
  assert.assertStrictEquals(p, 2);
  assert.assertStrictEquals(q, 3);
  assert.assertStrictEquals(r, 4);
  assert.assertStrictEquals(s, undefined);

  mock.assertSpyCalls(lazySpyFn, 1);
  mock.assertSpyCalls(transientSpyFn, 2);
});
