// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as jsRuntime from "@eser/standards/js-runtime";
import { appendToArray } from "./append-to-array.ts";

const group = "append-to-array";

jsRuntime.current.bench(
  "@eser/fp/append-to-array",
  { group, baseline: true },
  () => {
    const arr1 = ["a", "b"];

    appendToArray(arr1, "c");
  },
);

jsRuntime.current.bench("spread operator", { group }, () => {
  const arr1 = ["a", "b"];

  [...arr1, "c"];
});
