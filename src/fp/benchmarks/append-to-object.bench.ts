import appendToObject from "../append-to-object.ts";

Deno.bench("hex/fp/append-to-object:basic", () => {
  const obj1 = { a: 1, b: 2 };

  appendToObject(obj1, { c: 3 });
});

Deno.bench("Object.assign", () => {
  const obj1 = { a: 1, b: 2 };

  Object.assign({}, obj1, { c: 3 });
});

Deno.bench("spread operator", () => {
  const obj1 = { a: 1, b: 2 };

  ({ ...obj1, c: 3 });
});
