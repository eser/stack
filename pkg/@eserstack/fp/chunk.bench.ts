// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as chunk from "./chunk.ts";
// lodash.chunk is CommonJS whose module.exports is one function, so it has no
// named exports to import as a namespace.
import lodashChunkUntyped from "lodash.chunk";

// lodash.chunk ships no types, and its JSDoc tags the internal `guard`
// parameter as `@param-`, so the inferred signature requires a third argument.
// The documented call is chunk(array, size), which is what this bench measures.
const lodashChunk = lodashChunkUntyped as <T>(
  array: ReadonlyArray<T>,
  size?: number,
) => Array<Array<T>>;

const group = "chunk";

Deno.bench("eser/fp/chunk", { group, baseline: true }, () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  chunk.chunk(arr, 3);
});

Deno.bench("npm:lodash.chunk", { group }, () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  lodashChunk(arr, 3);
});
