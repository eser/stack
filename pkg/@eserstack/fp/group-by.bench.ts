// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as groupBy from "./group-by.ts";
// lodash.groupby is CommonJS whose module.exports is one function, so it has no
// named exports to import as a namespace.
import lodashGroupBy from "lodash.groupby";

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
