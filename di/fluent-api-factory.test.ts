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

  bdd.it("di.get(): non-string keys", () => {
    const { di } = create();

    const fnKey = () => null;
    di.register(fnKey, "zz6");

    const result = di.get(fnKey);

    assert.assertStrictEquals(result, "zz6");
  });

  bdd.it("di.many()", () => {
    const { di } = create();

    di.register("f", "h3");
    di.register("g", "i5");

    assert.assertEquals(di.many("f", "g"), ["h3", "i5"]);
  });

  bdd.it("di.invoke(): lambda", () => {
    const { di } = create();

    di.register("j", mock.spy());

    // deno-fmt-ignore
    const fn: (_: () => void) => void = j => j();

    di.invoke(fn);
    di.invoke(fn);

    mock.assertSpyCalls(di`j`, 2);
  });

  bdd.it("di.invoke(): lambda, multiple", () => {
    const { di } = create();

    di.register("k", mock.spy());
    di.register("l", mock.spy());
    di.register("m", mock.spy());

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

  bdd.it("di.invoke(): anonymous function", () => {
    const { di } = create();

    di.register("n", mock.spy());

    const fn = function (n: () => void) {
      n();
    };

    di.invoke(fn);
    di.invoke(fn);

    mock.assertSpyCalls(di`n`, 2);
  });

  bdd.it("di.invoke(): anonymous function, multiple", () => {
    const { di } = create();

    di.register("o", mock.spy());
    di.register("p", mock.spy());
    di.register("q", mock.spy());

    const fn = function (o: () => void, p: () => void, q: () => void) {
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

  bdd.it("di.invoke(): named function", () => {
    const { di } = create();

    di.register("r", mock.spy());

    const fn = function myFunc(r: () => void) {
      r();
    };

    di.invoke(fn);
    di.invoke(fn);

    mock.assertSpyCalls(di`r`, 2);
  });

  bdd.it("di.invoke(): named function, multiple", () => {
    const { di } = create();

    di.register("s", mock.spy());
    di.register("t", mock.spy());
    di.register("u", mock.spy());

    const fn = function myFunc(s: () => void, t: () => void, u: () => void) {
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

  bdd.it("di.invoke(): generator function", () => {
    const { di } = create();

    di.register("v", mock.spy());

    const fn = function* myFunc(v: () => void) {
      yield v();
    };

    for (const _ of di.invoke(fn)) { /* noop */ }
    for (const _ of di.invoke(fn)) { /* noop */ }

    mock.assertSpyCalls(di`v`, 2);
  });

  bdd.it("di.invoke(): generator function, multiple", () => {
    const { di } = create();

    di.register("w", mock.spy());
    di.register("x", mock.spy());
    di.register("y", mock.spy());

    const fn = function* myFunc(w: () => void, x: () => void, y: () => void) {
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

  bdd.it("di.invoke(): async function", async () => {
    const { di } = create();

    di.register("z", mock.spy());

    const fn = async function myFunc(z: () => void) {
      await Promise.resolve(z());
    };

    await di.invoke(fn);
    await di.invoke(fn);

    mock.assertSpyCalls(di`z`, 2);
  });

  bdd.it("di.invoke(): async function, multiple", async () => {
    const { di } = create();

    di.register("aa", mock.spy());
    di.register("ab", mock.spy());
    di.register("ac", mock.spy());

    const fn = async function myFunc(
      aa: () => void,
      ab: () => void,
      ac: () => void,
    ) {
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

  bdd.it("di.invoke(): async generator function", async () => {
    const { di } = create();

    di.register("ad", mock.spy());

    const fn = async function* myFunc(ad: () => void) {
      yield await Promise.resolve(ad());
    };

    for await (const _ of di.invoke(fn)) { /* noop */ }
    for await (const _ of di.invoke(fn)) { /* noop */ }

    mock.assertSpyCalls(di`ad`, 2);
  });

  bdd.it("di.invoke(): async generator function, multiple", async () => {
    const { di } = create();

    di.register("ae", mock.spy());
    di.register("af", mock.spy());
    di.register("ag", mock.spy());

    const fn = async function* myFunc(
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
});
