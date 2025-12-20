// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { deepCopy, deepCopy2 } from "./deep-copy.ts";

const group = "deep-copy";

class Dummy {
  prop: unknown;

  constructor(prop: unknown) {
    this.prop = prop;
  }
}

Deno.bench("@eser/fp/deep-copy", { group, baseline: true }, () => {
  const obj1 = new Dummy({ value: 5 });

  deepCopy(obj1);
});

Deno.bench("@eser/fp/deep-copy-2", { group }, () => {
  const obj1 = new Dummy({ value: 5 });

  deepCopy2(obj1);
});

Deno.bench("structuredClone", { group }, () => {
  const obj1 = new Dummy({ value: 5 });

  structuredClone(obj1);
});
