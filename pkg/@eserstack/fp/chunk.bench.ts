// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { chunk } from "./chunk.ts";
import lodashChunk from "npm:lodash.chunk@^4.2.0";

const group = "chunk";

Deno.bench("eser/fp/chunk", { group, baseline: true }, () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  chunk(arr, 3);
});

Deno.bench("npm:lodash.chunk", { group }, () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  lodashChunk(arr, 3);
});
