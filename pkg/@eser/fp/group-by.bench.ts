// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { groupBy } from "./group-by.ts";
import lodashGroupBy from "npm:lodash.groupby@^4.6.0";

const group = "group-by";

Deno.bench("eser/fp/groupBy", { group, baseline: true }, () => {
  const arr = [
    { type: "a", value: 1 },
    { type: "b", value: 2 },
    { type: "a", value: 3 },
    { type: "c", value: 4 },
    { type: "b", value: 5 },
  ];

  groupBy(arr, (x) => x.type);
});

Deno.bench("npm:lodash.groupby", { group }, () => {
  const arr = [
    { type: "a", value: 1 },
    { type: "b", value: 2 },
    { type: "a", value: 3 },
    { type: "c", value: 4 },
    { type: "b", value: 5 },
  ];

  lodashGroupBy(arr, (x: { type: string }) => x.type);
});
