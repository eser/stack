// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as appendToArray from "./append-to-array.ts";

const group = "append-to-array";

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("@eserstack/fp/append-to-array", () => {
        const arr1 = ["a", "b"];

        appendToArray.appendToArray(arr1, "c");
      })
      .baseline();
    mitata.bench("spread operator", () => {
      const arr1 = ["a", "b"];

      [...arr1, "c"];
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
