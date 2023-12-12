// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as runtime from "../standards/runtime.ts";
import { mutate } from "./mutate.ts";

const group = "mutate";

runtime.bench("cool/fp/mutate", { group, baseline: true }, () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: [],
  };

  mutate(obj1, (x) => x.firstName = "Helo");
});

runtime.bench("Object.assign", { group }, () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: [],
  };

  Object.assign({}, obj1, { firstName: "Helo" });
});

runtime.bench("spread operator", { group }, () => {
  const obj1 = {
    firstName: "Eser",
    lastName: "Ozvataf",
    aliases: [],
  };

  ({ ...obj1, firstName: "Helo" });
});
