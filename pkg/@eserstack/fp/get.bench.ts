// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { get } from "./get.ts";
import lodashGet from "npm:lodash.get@^4.4.2";

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

  get(obj, ["a", "b", "c", "d", "value"]);
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
