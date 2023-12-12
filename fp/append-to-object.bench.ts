// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as runtime from "../standards/runtime.ts";
import { appendToObject } from "./append-to-object.ts";

const group = "append-to-object";

runtime.bench("cool/fp/append-to-object", { group, baseline: true }, () => {
  const obj1 = { a: 1, b: 2 };

  appendToObject(obj1, { c: 3 });
});

runtime.bench("Object.assign", { group }, () => {
  const obj1 = { a: 1, b: 2 };

  Object.assign({}, obj1, { c: 3 });
});

runtime.bench("spread operator", { group }, () => {
  const obj1 = { a: 1, b: 2 };

  ({ ...obj1, c: 3 });
});
