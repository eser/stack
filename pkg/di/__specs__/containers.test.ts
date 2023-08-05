import { assert, bdd, mock } from "./deps.ts";
import { container } from "../containers.ts";

bdd.describe("hex/di/containers", () => {
  bdd.it("basic", () => {
    const sandbox = container();

    sandbox.setValue("a", 5);

    assert.assertStrictEquals(sandbox.get("a"), 5);
  });

  bdd.it("empty", () => {
    const sandbox = container();

    assert.assertStrictEquals(sandbox.get("_"), undefined);
  });

  bdd.it("symbols", () => {
    const sandbox = container();
    const b = Symbol("b");

    sandbox.setValue(b, 6);

    assert.assertStrictEquals(sandbox.get(b), 6);
  });

  bdd.it("nullables", () => {
    const sandbox = container();

    sandbox.setValue("c", null);
    sandbox.setValue("d", undefined);

    assert.assertStrictEquals(sandbox.get("c"), null);
    assert.assertStrictEquals(sandbox.get("d"), undefined);
    assert.assertStrictEquals(sandbox.get("e", "non-exists"), "non-exists");
    assert.assertStrictEquals(sandbox.get("f"), undefined);
  });

  bdd.it("functions", () => {
    const sandbox = container();

    sandbox.setValue("g", (x: number) => x + 3);

    const result = sandbox.get("g");

    assert.assertStrictEquals(result.constructor, Function);
    assert.assertStrictEquals(result(5), 8);
  });

  bdd.it("factory", () => {
    const sandbox = container();

    let number = 1;
    sandbox.setFactory("h", () => number++);

    assert.assertStrictEquals(sandbox.get("h"), 1);
    assert.assertStrictEquals(sandbox.get("h"), 2);
    assert.assertStrictEquals(sandbox.get("h"), 3);
  });

  bdd.it("promise", async () => {
    const sandbox = container();

    sandbox.setFactory("h", () => Promise.resolve("test"));

    assert.assertStrictEquals(await sandbox.get("h"), "test");
  });

  bdd.it("lazy values", () => {
    const sandbox = container();

    const spyFn = mock.spy();

    let number = 1;
    sandbox.setValueLazy("h", () => {
      spyFn();
      return ++number;
    });

    assert.assertStrictEquals(number, 1);
    assert.assertStrictEquals(sandbox.get("h"), 2);
    assert.assertStrictEquals(number, 2);

    mock.assertSpyCalls(spyFn, 1);
  });

  bdd.it("getMany", () => {
    const sandbox = container();

    const lazySpyFn = mock.spy();
    const factorySpyFn = mock.spy();

    let number = 1;
    sandbox.setValue("a", number);
    sandbox.setValueLazy("b", () => {
      lazySpyFn();
      return ++number;
    });
    sandbox.setValueLazy("c", () => {
      factorySpyFn();
      return ++number;
    });

    assert.assertStrictEquals(number, 1);

    const { a, b, c, d } = sandbox.getMany("a", "b", "c", "d");

    assert.assertStrictEquals(number, 3);
    assert.assertStrictEquals(a, 1);
    assert.assertStrictEquals(b, 2);
    assert.assertStrictEquals(c, 3);
    assert.assertStrictEquals(d, undefined);

    mock.assertSpyCalls(lazySpyFn, 1);
    mock.assertSpyCalls(factorySpyFn, 1);
  });

  bdd.it("mixed keys", () => {
    const sandbox = container();

    sandbox.setValue(Object.keys, "Object.keys method");
    sandbox.setValue(Object.values, "Object.values method");
    sandbox.setValue(Object.entries, "Object.entries method");

    assert.assertStrictEquals(sandbox.get(Object.keys), "Object.keys method");
    assert.assertStrictEquals(
      sandbox.get(Object.values),
      "Object.values method",
    );
    assert.assertStrictEquals(
      sandbox.get(Object.entries),
      "Object.entries method",
    );
  });
});
