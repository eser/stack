import { asserts } from "./deps.ts";
import { container } from "../containers.ts";

Deno.test("hex/di/container:basic", () => {
  const sandbox = container();

  sandbox.setValue("a", 5);

  asserts.assertStrictEquals(sandbox.get("a"), 5);
});

Deno.test("hex/di/container:empty", () => {
  const sandbox = container();

  asserts.assertStrictEquals(sandbox.get("_"), undefined);
});

Deno.test("hex/di/container:with symbols", () => {
  const sandbox = container();
  const b = Symbol("b");

  sandbox.setValue(b, 6);

  asserts.assertStrictEquals(sandbox.get(b), 6);
});

Deno.test("hex/di/container:with nullables", () => {
  const sandbox = container();

  sandbox.setValue("c", null);
  sandbox.setValue("d", undefined);

  asserts.assertStrictEquals(sandbox.get("c"), null);
  asserts.assertStrictEquals(sandbox.get("d"), undefined);
  asserts.assertStrictEquals(sandbox.get("e", "non-exists"), "non-exists");
  asserts.assertStrictEquals(sandbox.get("f"), undefined);
});

Deno.test("hex/di/container:with functions", () => {
  const sandbox = container();

  sandbox.setValue("g", (x: number) => x + 3);

  const result = sandbox.get("g");

  asserts.assertStrictEquals(result.constructor, Function);
  asserts.assertStrictEquals(result(5), 8);
});

Deno.test("hex/di/container:with factory", () => {
  const sandbox = container();

  let number = 1;
  sandbox.setFactory("h", () => number++);

  asserts.assertStrictEquals(sandbox.get("h"), 1);
  asserts.assertStrictEquals(sandbox.get("h"), 2);
  asserts.assertStrictEquals(sandbox.get("h"), 3);
});

Deno.test("hex/di/container:with mixed keys", () => {
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
