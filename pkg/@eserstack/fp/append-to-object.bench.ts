// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as appendToObject from "./append-to-object.ts";

const group = "append-to-object";

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("@eserstack/fp/append-to-object", () => {
        const obj1 = { a: 1, b: 2 };

        appendToObject.appendToObject(obj1, { c: 3 });
      })
      .baseline();
    mitata.bench("Object.assign", () => {
      const obj1 = { a: 1, b: 2 };

      Object.assign({}, obj1, { c: 3 });
    });
    mitata.bench("spread operator", () => {
      const obj1 = { a: 1, b: 2 };

      ({ ...obj1, c: 3 });
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
