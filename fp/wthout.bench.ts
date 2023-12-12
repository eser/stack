// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import * as runtime from "../standards/runtime.ts";
import { wthout } from "./wthout.ts";
import lodashReject from "npm:lodash.reject";

const group = "wthout";

runtime.bench("cool/fp/wthout", { group, baseline: true }, () => {
  const student = {
    id: 1,
    name: "John Doe",
    age: 20,
    address: "New York",
  };

  wthout(student, "name", "age");
});

runtime.bench("npm:lodash.reject", { group }, () => {
  const student = {
    id: 1,
    name: "John Doe",
    age: 20,
    address: "New York",
  };

  lodashReject(student, "name", "age");
});
