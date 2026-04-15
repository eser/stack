// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { keyBy } from "./key-by.ts";
import lodashKeyBy from "npm:lodash.keyby@^4.6.0";

const group = "key-by";

Deno.bench("eser/fp/keyBy", { group, baseline: true }, () => {
  const arr = [
    { id: "a", name: "Alice" },
    { id: "b", name: "Bob" },
    { id: "c", name: "Charlie" },
    { id: "d", name: "David" },
    { id: "e", name: "Eve" },
  ];

  keyBy(arr, (x) => x.id);
});

Deno.bench("npm:lodash.keyby", { group }, () => {
  const arr = [
    { id: "a", name: "Alice" },
    { id: "b", name: "Bob" },
    { id: "c", name: "Charlie" },
    { id: "d", name: "David" },
    { id: "e", name: "Eve" },
  ];

  lodashKeyBy(arr, (x: { id: string }) => x.id);
});
