// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as wthout from "./wthout.ts";

const group = "wthout";

Deno.bench("eser/fp/wthout", { group, baseline: true }, () => {
  const student = {
    id: 1,
    name: "John Doe",
    age: 20,
    address: "New York",
  };

  wthout.wthout(student, "name", "age");
});

Deno.bench("rest destructuring", { group }, () => {
  const student = {
    id: 1,
    name: "John Doe",
    age: 20,
    address: "New York",
  };

  const { name: _name, age: _age, ..._withoutResult } = student;
});

Deno.bench("Object.fromEntries with filter", { group }, () => {
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
