// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as get from "./get.ts";
// lodash.get is CommonJS whose module.exports is one function, so it has no
// named exports to import as a namespace.
import lodashGet from "lodash.get";

const group = "get";

mitata.group(group, () => {
  mitata.summary(() => {
    mitata
      .bench("eser/fp/get", () => {
        const obj = {
          a: {
            b: {
              c: {
                d: {
                  value: 42,
                },
              },
            },
          },
        };

        get.get(obj, ["a", "b", "c", "d", "value"]);
      })
      .baseline();
    mitata.bench("npm:lodash.get (array path)", () => {
      const obj = {
        a: {
          b: {
            c: {
              d: {
                value: 42,
              },
            },
          },
        },
      };

      lodashGet(obj, ["a", "b", "c", "d", "value"]);
    });
    mitata.bench("npm:lodash.get (string path)", () => {
      const obj = {
        a: {
          b: {
            c: {
              d: {
                value: 42,
              },
            },
          },
        },
      };

      lodashGet(obj, "a.b.c.d.value");
    });
  });
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
