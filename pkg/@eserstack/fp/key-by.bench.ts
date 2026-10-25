// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as keyBy from "./key-by.ts";
import * as lodashKeyByModule from "lodash.keyby";

// lodash.keyby is CommonJS whose module.exports is one function; Node exposes
// it as the namespace's default export (types in lodash-modules.d.ts).
const lodashKeyBy = lodashKeyByModule.default;

const group = "key-by";

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("eser/fp/keyBy", () => {
        const arr = [
          { id: "a", name: "Alice" },
          { id: "b", name: "Bob" },
          { id: "c", name: "Charlie" },
          { id: "d", name: "David" },
          { id: "e", name: "Eve" },
        ];

        keyBy.keyBy(arr, (x) => x.id);
      })
      .baseline();
    mitata.bench("npm:lodash.keyby", () => {
      const arr = [
        { id: "a", name: "Alice" },
        { id: "b", name: "Bob" },
        { id: "c", name: "Charlie" },
        { id: "d", name: "David" },
        { id: "e", name: "Eve" },
      ];

      lodashKeyBy(arr, (x: { id: string }) => x.id);
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
