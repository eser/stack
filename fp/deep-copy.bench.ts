// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as runtime from "../standards/runtime.ts";
import { deepCopy, deepCopy2 } from "./deep-copy.ts";

const group = "deep-copy";

class Dummy {
  prop: unknown;

  constructor(prop: unknown) {
    this.prop = prop;
  }
}

runtime.bench("cool/fp/deep-copy", { group, baseline: true }, () => {
  const obj1 = new Dummy({ value: 5 });

  deepCopy(obj1);
});

runtime.bench("cool/fp/deep-copy-2", { group }, () => {
  const obj1 = new Dummy({ value: 5 });

  deepCopy2(obj1);
});

runtime.bench("structuredClone", { group }, () => {
  const obj1 = new Dummy({ value: 5 });

  structuredClone(obj1);
});
