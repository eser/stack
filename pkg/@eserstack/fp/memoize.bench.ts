// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { memoize } from "./memoize.ts";
import lodashMemoize from "npm:lodash.memoize@^4.1.2";

const group = "memoize";

// Simple computation for benchmarking
const compute = (x: number) => x * 2 + 1;

const eserMemoized = memoize(compute);
const lodashMemoized = lodashMemoize(compute);

Deno.bench("eser/fp/memoize (cache hit)", { group, baseline: true }, () => {
  eserMemoized(42);
});

Deno.bench("npm:lodash.memoize (cache hit)", { group }, () => {
  lodashMemoized(42);
});

// Benchmark cache miss scenario
let eserCounter = 0;
let lodashCounter = 0;

const eserFreshMemoized = memoize((x: number) => x * 2);
const lodashFreshMemoized = lodashMemoize((x: number) => x * 2);

Deno.bench("eser/fp/memoize (cache miss)", { group }, () => {
  eserFreshMemoized(eserCounter++);
});

Deno.bench("npm:lodash.memoize (cache miss)", { group }, () => {
  lodashFreshMemoized(lodashCounter++);
});
