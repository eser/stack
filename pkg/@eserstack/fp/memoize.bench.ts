// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as memoize from "./memoize.ts";
// lodash.memoize is CommonJS whose module.exports is one function, so it has no
// named exports to import as a namespace.
import lodashMemoize from "lodash.memoize";

const group = "memoize";

// Simple computation for benchmarking
const compute = (x: number) => x * 2 + 1;

const eserMemoized = memoize.memoize(compute);
const lodashMemoized = lodashMemoize(compute);

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("eser/fp/memoize (cache hit)", () => {
        eserMemoized(42);
      })
      .baseline();
    mitata.bench("npm:lodash.memoize (cache hit)", () => {
      lodashMemoized(42);
    });
    mitata.bench("eser/fp/memoize (cache miss)", () => {
      eserFreshMemoized(eserCounter++);
    });
    mitata.bench("npm:lodash.memoize (cache miss)", () => {
      lodashFreshMemoized(lodashCounter++);
    });
  });
});

// Benchmark cache miss scenario
let eserCounter = 0;
let lodashCounter = 0;

const eserFreshMemoized = memoize.memoize((x: number) => x * 2);
const lodashFreshMemoized = lodashMemoize((x: number) => x * 2);

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
