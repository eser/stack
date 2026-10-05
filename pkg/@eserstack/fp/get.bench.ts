// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as get from "./get.ts";
// lodash.get is CommonJS whose module.exports is one function, so it has no
// named exports to import as a namespace.
import lodashGet from "lodash.get";

const group = "get";

Deno.bench("eser/fp/get", { group, baseline: true }, () => {
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
});

Deno.bench("npm:lodash.get (array path)", { group }, () => {
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

Deno.bench("npm:lodash.get (string path)", { group }, () => {
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
