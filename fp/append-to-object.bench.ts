// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runtime from "../standards/runtime.ts";
import { appendToObject } from "./append-to-object.ts";

const group = "append-to-object";

runtime.current.bench(
  "cool/fp/append-to-object",
  { group, baseline: true },
  () => {
    const obj1 = { a: 1, b: 2 };

    appendToObject(obj1, { c: 3 });
  },
);

runtime.current.bench("Object.assign", { group }, () => {
  const obj1 = { a: 1, b: 2 };

  Object.assign({}, obj1, { c: 3 });
});

runtime.current.bench("spread operator", { group }, () => {
  const obj1 = { a: 1, b: 2 };

  ({ ...obj1, c: 3 });
});
