// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as mod from "./mod.ts";

Deno.test("greet returns greeting message", () => {
  const result = mod.greet("World");

  assert.assertEquals(result, "Hello, World!");
});
