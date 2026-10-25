// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as wthout from "./wthout.ts";

const group = "wthout";

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("eser/fp/wthout", () => {
        const student = {
          id: 1,
          name: "John Doe",
          age: 20,
          address: "New York",
        };

        wthout.wthout(student, "name", "age");
      })
      .baseline();
    mitata.bench("rest destructuring", () => {
      const student = {
        id: 1,
        name: "John Doe",
        age: 20,
        address: "New York",
      };

      const { name: _name, age: _age, ..._withoutResult } = student;
    });
    mitata.bench("Object.fromEntries with filter", () => {
      const student = {
        id: 1,
        name: "John Doe",
        age: 20,
        address: "New York",
      };
      const exclude = new Set(["name", "age"]);

      Object.fromEntries(
        Object.entries(student).filter(([key]) => !exclude.has(key)),
      );
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
