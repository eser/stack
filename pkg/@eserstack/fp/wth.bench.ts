// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as wth from "./wth.ts";

const group = "wth";

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("eser/fp/wth", () => {
        wth.wth({ a: 1 }, { b: 2 });
      })
      .baseline();
    mitata.bench("spread operator", () => {
      const instance = { a: 1 };
      const mapping = { b: 2 };

      const _withResult = { ...instance, ...mapping };
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
