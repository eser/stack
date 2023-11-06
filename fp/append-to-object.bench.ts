// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

import { deno } from "../deps.ts";
import { appendToObject } from "./append-to-object.ts";

const group = "append-to-object";

deno.bench("cool/fp/append-to-object", { group, baseline: true }, () => {
  const obj1 = { a: 1, b: 2 };

  appendToObject(obj1, { c: 3 });
});

deno.bench("Object.assign", { group }, () => {
  const obj1 = { a: 1, b: 2 };

  Object.assign({}, obj1, { c: 3 });
});

deno.bench("spread operator", { group }, () => {
  const obj1 = { a: 1, b: 2 };

  ({ ...obj1, c: 3 });
});
