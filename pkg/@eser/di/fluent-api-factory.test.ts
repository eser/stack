// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as mock from "@std/testing/mock";
import { Registry } from "./container.ts";
import { factory } from "./fluent-api-factory.ts";

const create = () => {
  const registry = new Registry();

  const services = registry.build();

  const di = factory(services);

  return { di, registry, services };
};

Deno.test("di template strings: non-existent key", () => {
  const { di } = create();

  assert.assertStrictEquals(di`_`, undefined);
});

Deno.test("di template strings: singleton value", () => {
  const { di } = create();

  di.set("a", "value");

  assert.assertStrictEquals(di`a`, "value");
});

Deno.test("di template strings: literals", () => {
  const { di } = create();

  di.set("b", "c2");
  di.set("d", "e4");

  assert.assertStrictEquals(di`${"b"} = ${"d"}.`, "c2 = e4.");
});

Deno.test("di.get(): non-string keys", () => {
  const { di } = create();

  const fnKey = () => null;
  di.set(fnKey, "zz6");

  const result = di.get(fnKey);

  assert.assertStrictEquals(result, "zz6");
});

Deno.test("di.getMany()", () => {
  const { di } = create();

  di.set("f", "h3");
  di.set("g", "i5");

  assert.assertEquals(di.getMany("f", "g"), ["h3", "i5"]);
});

Deno.test("di.invoke(): lambda", () => {
  const { di } = create();

  di.set("j", mock.spy());

  // deno-fmt-ignore
  const fn: (_: () => void) => void = j => j();

  di.invoke(fn);
  di.invoke(fn);

  mock.assertSpyCalls(di`j`, 2);
});

Deno.test("di.invoke(): lambda, multiple", () => {
  const { di } = create();

  di.set("k", mock.spy());
  di.set("l", mock.spy());
  di.set("m", mock.spy());

  const fn = (k: () => void, l: () => void, m: () => void) => {
    k();
    l();
    l();
    m();
    m();
    m();
  };

  di.invoke(fn);

  mock.assertSpyCalls(di`k`, 1);
  mock.assertSpyCalls(di`l`, 2);
  mock.assertSpyCalls(di`m`, 3);
});

Deno.test("di.invoke(): anonymous function", () => {
  const { di } = create();

  di.set("n", mock.spy());

  const fn = (n: () => void) => {
    n();
  };

  di.invoke(fn);
  di.invoke(fn);

  mock.assertSpyCalls(di`n`, 2);
});

Deno.test("di.invoke(): anonymous function, multiple", () => {
  const { di } = create();

  di.set("o", mock.spy());
  di.set("p", mock.spy());
  di.set("q", mock.spy());

  const fn = (o: () => void, p: () => void, q: () => void) => {
    o();
    p();
    p();
    q();
    q();
    q();
  };

  di.invoke(fn);

  mock.assertSpyCalls(di`o`, 1);
  mock.assertSpyCalls(di`p`, 2);
  mock.assertSpyCalls(di`q`, 3);
});

Deno.test("di.invoke(): named function", () => {
  const { di } = create();

  di.set("r", mock.spy());

  const fn = (r: () => void) => {
    r();
  };

  di.invoke(fn);
  di.invoke(fn);

  mock.assertSpyCalls(di`r`, 2);
});

Deno.test("di.invoke(): named function, multiple", () => {
  const { di } = create();

  di.set("s", mock.spy());
  di.set("t", mock.spy());
  di.set("u", mock.spy());

  const fn = (s: () => void, t: () => void, u: () => void) => {
    s();
    t();
    t();
    u();
    u();
    u();
  };

  di.invoke(fn);

  mock.assertSpyCalls(di`s`, 1);
  mock.assertSpyCalls(di`t`, 2);
  mock.assertSpyCalls(di`u`, 3);
});

Deno.test("di.invoke(): generator function", () => {
  const { di } = create();

  di.set("v", mock.spy());

  const fn = function* (v: () => void) {
    yield v();
  };

  for (const _ of di.invoke(fn)) { /* noop */ }
  for (const _ of di.invoke(fn)) { /* noop */ }

  mock.assertSpyCalls(di`v`, 2);
});

Deno.test("di.invoke(): generator function, multiple", () => {
  const { di } = create();

  di.set("w", mock.spy());
  di.set("x", mock.spy());
  di.set("y", mock.spy());

  const fn = function* (w: () => void, x: () => void, y: () => void) {
    yield w();
    yield x();
    yield x();
    yield y();
    yield y();
    yield y();
  };

  for (const _ of di.invoke(fn)) { /* noop */ }

  mock.assertSpyCalls(di`w`, 1);
  mock.assertSpyCalls(di`x`, 2);
  mock.assertSpyCalls(di`y`, 3);
});

Deno.test("di.invoke(): async function", async () => {
  const { di } = create();

  di.set("z", mock.spy());

  const fn = async (z: () => void) => {
    await Promise.resolve(z());
  };

  await di.invoke(fn);
  await di.invoke(fn);

  mock.assertSpyCalls(di`z`, 2);
});

Deno.test("di.invoke(): async function, multiple", async () => {
  const { di } = create();

  di.set("aa", mock.spy());
  di.set("ab", mock.spy());
  di.set("ac", mock.spy());

  const fn = async (
    aa: () => void,
    ab: () => void,
    ac: () => void,
  ) => {
    await Promise.all([
      Promise.resolve(aa()),
      Promise.resolve(ab()),
      Promise.resolve(ab()),
      Promise.resolve(ac()),
      Promise.resolve(ac()),
      Promise.resolve(ac()),
    ]);
  };

  await di.invoke(fn);

  mock.assertSpyCalls(di`aa`, 1);
  mock.assertSpyCalls(di`ab`, 2);
  mock.assertSpyCalls(di`ac`, 3);
});

Deno.test("di.invoke(): async generator function", async () => {
  const { di } = create();

  di.set("ad", mock.spy());

  const fn = async function* (ad: () => void) {
    yield await Promise.resolve(ad());
  };

  for await (const _ of di.invoke(fn)) { /* noop */ }
  for await (const _ of di.invoke(fn)) { /* noop */ }

  mock.assertSpyCalls(di`ad`, 2);
});

Deno.test("di.invoke(): async generator function, multiple", async () => {
  const { di } = create();

  di.set("ae", mock.spy());
  di.set("af", mock.spy());
  di.set("ag", mock.spy());

  const fn = async function* (
    ae: () => void,
    af: () => void,
    ag: () => void,
  ) {
    yield await Promise.resolve(ae());
    yield await Promise.resolve(af());
    yield await Promise.resolve(af());
    yield await Promise.resolve(ag());
    yield await Promise.resolve(ag());
    yield await Promise.resolve(ag());
  };

  for await (const _ of di.invoke(fn)) { /* noop */ }

  mock.assertSpyCalls(di`ae`, 1);
  mock.assertSpyCalls(di`af`, 2);
  mock.assertSpyCalls(di`ag`, 3);
});

Deno.test("di() with no arguments returns services", () => {
  const { di, services } = create();

  const result = di();

  assert.assertStrictEquals(result, services);
});

Deno.test("di.createScope() creates new scope", () => {
  const { di } = create();

  di.set("ah", "original");
  const scope = di.createScope();

  assert.assertExists(scope);
  assert.assertStrictEquals(scope.get("ah"), "original");
});

Deno.test("di.setLazy() registers lazy value", () => {
  const { di } = create();

  let counter = 0;
  di.setLazy("ai", () => ++counter);

  assert.assertStrictEquals(di`ai`, 1);
  assert.assertStrictEquals(di`ai`, 1); // Same value on second call (cached)
});

Deno.test("di.setScoped() registers scoped value", () => {
  const { di } = create();

  let counter = 0;
  di.setScoped("aj", () => ++counter);

  assert.assertStrictEquals(di`aj`, 1);
  assert.assertStrictEquals(di`aj`, 1);

  const scope = di.createScope();
  assert.assertStrictEquals(scope.get("aj"), 2); // New value in new scope
  assert.assertStrictEquals(scope.get("aj"), 2); // Same value in same scope
});

Deno.test("di.setTransient() registers transient value", () => {
  const { di } = create();

  let counter = 0;
  di.setTransient("ak", () => ++counter);

  assert.assertStrictEquals(di`ak`, 1);
  assert.assertStrictEquals(di`ak`, 2); // New value each time
  assert.assertStrictEquals(di`ak`, 3);
});
