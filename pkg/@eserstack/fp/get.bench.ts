// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as mitata from "mitata";
import * as get from "./get.ts";
import * as lodashGetModule from "lodash.get";

// lodash.get is CommonJS whose module.exports is one function; Node exposes
// it as the namespace's default export (types in lodash-modules.d.ts).
const lodashGet = lodashGetModule.default;

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
