import { asserts, bdd, mock } from "./deps.ts";
import { container } from "../containers.ts";

bdd.describe("hex/lib/di/containers", () => {
  bdd.it("basic", () => {
    const sandbox = container();

    sandbox.setValue("a", 5);

    asserts.assertStrictEquals(sandbox.get("a"), 5);
  });

  bdd.it("empty", () => {
    const sandbox = container();

    asserts.assertStrictEquals(sandbox.get("_"), undefined);
  });

  bdd.it("symbols", () => {
    const sandbox = container();
    const b = Symbol("b");

    sandbox.setValue(b, 6);

    asserts.assertStrictEquals(sandbox.get(b), 6);
  });

  bdd.it("nullables", () => {
    const sandbox = container();

    sandbox.setValue("c", null);
    sandbox.setValue("d", undefined);

    asserts.assertStrictEquals(sandbox.get("c"), null);
    asserts.assertStrictEquals(sandbox.get("d"), undefined);
    asserts.assertStrictEquals(sandbox.get("e", "non-exists"), "non-exists");
    asserts.assertStrictEquals(sandbox.get("f"), undefined);
  });

  bdd.it("functions", () => {
    const sandbox = container();

    sandbox.setValue("g", (x: number) => x + 3);

    const result = sandbox.get("g");

    asserts.assertStrictEquals(result.constructor, Function);
    asserts.assertStrictEquals(result(5), 8);
  });

  bdd.it("factory", () => {
    const sandbox = container();

    let number = 1;
    sandbox.setFactory("h", () => number++);

    asserts.assertStrictEquals(sandbox.get("h"), 1);
    asserts.assertStrictEquals(sandbox.get("h"), 2);
    asserts.assertStrictEquals(sandbox.get("h"), 3);
  });

  bdd.it("promise", async () => {
    const sandbox = container();

    sandbox.setFactory("h", () => Promise.resolve("test"));

    asserts.assertStrictEquals(await sandbox.get("h"), "test");
  });

  bdd.it("lazy values", () => {
    const sandbox = container();

    const spyFn = mock.spy();

    let number = 1;
    sandbox.setValueLazy("h", () => {
      spyFn();
      return ++number;
    });

    asserts.assertStrictEquals(number, 1);
    asserts.assertStrictEquals(sandbox.get("h"), 2);
    asserts.assertStrictEquals(number, 2);

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

    asserts.assertStrictEquals(number, 1);

    const { a, b, c, d } = sandbox.getMany("a", "b", "c", "d");

    asserts.assertStrictEquals(number, 3);
    asserts.assertStrictEquals(a, 1);
    asserts.assertStrictEquals(b, 2);
    asserts.assertStrictEquals(c, 3);
    asserts.assertStrictEquals(d, undefined);

    mock.assertSpyCalls(lazySpyFn, 1);
    mock.assertSpyCalls(factorySpyFn, 1);
  });

  bdd.it("mixed keys", () => {
    const sandbox = container();

    sandbox.setValue(Object.keys, "Object.keys method");
    sandbox.setValue(Object.values, "Object.values method");
    sandbox.setValue(Object.entries, "Object.entries method");

    asserts.assertStrictEquals(sandbox.get(Object.keys), "Object.keys method");
    asserts.assertStrictEquals(
      sandbox.get(Object.values),
      "Object.values method",
    );
    asserts.assertStrictEquals(
      sandbox.get(Object.entries),
      "Object.entries method",
    );
  });
});
