// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { wthout } from "./wthout.ts";
import lodashReject from "npm:lodash.reject@^4.6.0";

const group = "wthout";

Deno.bench("eser/fp/wthout", { group, baseline: true }, () => {
  const student = {
    id: 1,
    name: "John Doe",
    age: 20,
    address: "New York",
  };

  wthout(student, "name", "age");
});

Deno.bench("npm:lodash.reject", { group }, () => {
  const student = {
    id: 1,
    name: "John Doe",
    age: 20,
    address: "New York",
  };

  lodashReject(student, "name", "age");
});
