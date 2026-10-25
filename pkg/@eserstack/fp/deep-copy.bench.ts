// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as deepCopy from "./deep-copy.ts";

const group = "deep-copy";

class Dummy {
  prop: unknown;

  constructor(prop: unknown) {
    this.prop = prop;
  }
}

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("@eserstack/fp/deep-copy", () => {
        const obj1 = new Dummy({ value: 5 });

        deepCopy.deepCopy(obj1);
      })
      .baseline();
    mitata.bench("@eserstack/fp/deep-copy-2", () => {
      const obj1 = new Dummy({ value: 5 });

      deepCopy.deepCopy2(obj1);
    });
    mitata.bench("structuredClone", () => {
      const obj1 = new Dummy({ value: 5 });

      structuredClone(obj1);
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
