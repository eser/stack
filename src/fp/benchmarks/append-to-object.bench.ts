import appendToObject from "../append-to-object.ts";

const group = "append-to-object";

Deno.bench("hex/fp/append-to-object", { group, baseline: true }, () => {
  const obj1 = { a: 1, b: 2 };

  appendToObject(obj1, { c: 3 });
});

Deno.bench("Object.assign", { group }, () => {
  const obj1 = { a: 1, b: 2 };

  Object.assign({}, obj1, { c: 3 });
});

Deno.bench("spread operator", { group }, () => {
  const obj1 = { a: 1, b: 2 };

  ({ ...obj1, c: 3 });
});
