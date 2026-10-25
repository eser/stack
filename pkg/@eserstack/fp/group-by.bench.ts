// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as groupBy from "./group-by.ts";
import * as lodashGroupByModule from "lodash.groupby";

// lodash.groupby is CommonJS whose module.exports is one function; Node exposes
// it as the namespace's default export (types in lodash-modules.d.ts).
const lodashGroupBy = lodashGroupByModule.default;

const group = "group-by";

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("eser/fp/groupBy", () => {
        const arr = [
          { type: "a", value: 1 },
          { type: "b", value: 2 },
          { type: "a", value: 3 },
          { type: "c", value: 4 },
          { type: "b", value: 5 },
        ];

        groupBy.groupBy(arr, (x) => x.type);
      })
      .baseline();
    mitata.bench("npm:lodash.groupby", () => {
      const arr = [
        { type: "a", value: 1 },
        { type: "b", value: 2 },
        { type: "a", value: 3 },
        { type: "c", value: 4 },
        { type: "b", value: 5 },
      ];

      lodashGroupBy(arr, (x: { type: string }) => x.type);
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
