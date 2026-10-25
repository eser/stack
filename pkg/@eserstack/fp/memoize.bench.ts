// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as memoize from "./memoize.ts";
import * as lodashMemoizeModule from "lodash.memoize";

// lodash.memoize is CommonJS whose module.exports is one function; Node exposes
// it as the namespace's default export (types in lodash-modules.d.ts).
const lodashMemoize = lodashMemoizeModule.default;

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
