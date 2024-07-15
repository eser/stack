// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as jsRuntime from "@eser/standards/js-runtime";
import { appendToObject } from "./append-to-object.ts";

const group = "append-to-object";

jsRuntime.current.bench(
  "@eser/fp/append-to-object",
  { group, baseline: true },
  () => {
    const obj1 = { a: 1, b: 2 };

    appendToObject(obj1, { c: 3 });
  },
);

jsRuntime.current.bench("Object.assign", { group }, () => {
  const obj1 = { a: 1, b: 2 };

  Object.assign({}, obj1, { c: 3 });
});

jsRuntime.current.bench("spread operator", { group }, () => {
  const obj1 = { a: 1, b: 2 };

  ({ ...obj1, c: 3 });
});
