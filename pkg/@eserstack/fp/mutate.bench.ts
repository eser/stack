// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as mutate from "./mutate.ts";

const group = "mutate";

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("@eserstack/fp/mutate", () => {
        const obj1 = {
          firstName: "Eser",
          lastName: "Ozvataf",
          aliases: [],
        };

        mutate.mutate(obj1, (x) => (x.firstName = "Helo"));
      })
      .baseline();
    mitata.bench("Object.assign", () => {
      const obj1 = {
        firstName: "Eser",
        lastName: "Ozvataf",
        aliases: [],
      };

      Object.assign({}, obj1, { firstName: "Helo" });
    });
    mitata.bench("spread operator", () => {
      const obj1 = {
        firstName: "Eser",
        lastName: "Ozvataf",
        aliases: [],
      };

      ({ ...obj1, firstName: "Helo" });
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
