// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as types from "./types.ts";
import * as multiselectMod from "./multiselect.ts";

const ctxWithKeys = (
  ...keys: Uint8Array[]
): ReturnType<typeof types.createTestContext> => {
  const test = types.createTestContext();

  (async () => {
    for (const key of keys) {
      await new Promise((r) => setTimeout(r, 10));
      test.pushInput(key);
    }
  })();

  return test;
};

const ENTER = new Uint8Array([0x0d]);
const ESCAPE = new Uint8Array([0x1b]);
const SPACE = new Uint8Array([0x20]);
const DOWN = new Uint8Array([0x1b, 0x5b, 0x42]);
const KEY_A = new Uint8Array([0x61]);

const OPTIONS = [
  { value: "ts", label: "TypeScript" },
  { value: "lint", label: "ESLint" },
  { value: "fmt", label: "Prettier" },
] as const;

Deno.test("multiselect returns empty array when required=false and Enter", async () => {
  const { ctx } = ctxWithKeys(ENTER);
  const result = await multiselectMod.multiselect(ctx, {
    message: "Features",
    options: OPTIONS,
    required: false,
  });
  assert.assertEquals(result, []);
});

Deno.test("multiselect returns selected values after Space + Enter", async () => {
  // Space toggles first item, Enter confirms
  const { ctx } = ctxWithKeys(SPACE, ENTER);
  const result = await multiselectMod.multiselect(ctx, {
    message: "Features",
    options: OPTIONS,
    required: false,
  });
  assert.assertEquals(result, ["ts"]);
});

Deno.test("multiselect selects multiple items", async () => {
  // Space (select first), Down, Space (select second), Enter
  const { ctx } = ctxWithKeys(SPACE, DOWN, SPACE, ENTER);
  const result = await multiselectMod.multiselect(ctx, {
    message: "Features",
    options: OPTIONS,
    required: false,
  });
  assert.assertEquals(result, ["ts", "lint"]);
});

Deno.test("multiselect toggle all with 'a'", async () => {
  const { ctx } = ctxWithKeys(KEY_A, ENTER);
  const result = await multiselectMod.multiselect(ctx, {
    message: "Features",
    options: OPTIONS,
    required: false,
  });
  assert.assertEquals(result, ["ts", "lint", "fmt"]);
});

Deno.test("multiselect toggle all twice deselects all", async () => {
  const { ctx } = ctxWithKeys(KEY_A, KEY_A, ENTER);
  const result = await multiselectMod.multiselect(ctx, {
    message: "Features",
    options: OPTIONS,
    required: false,
  });
  assert.assertEquals(result, []);
});

Deno.test("multiselect required prevents empty confirm", async () => {
  // First Enter should fail (required, nothing selected), then Space to select, Enter
  const { ctx } = ctxWithKeys(ENTER, SPACE, ENTER);
  const result = await multiselectMod.multiselect(ctx, {
    message: "Features",
    options: OPTIONS,
    required: true,
  });
  assert.assertEquals(result, ["ts"]);
});

Deno.test("multiselect returns CANCEL on Escape", async () => {
  const { ctx } = ctxWithKeys(ESCAPE);
  const result = await multiselectMod.multiselect(ctx, {
    message: "Features",
    options: OPTIONS,
  });
  assert.assertEquals(types.isCancel(result), true);
});

Deno.test("multiselect respects initialValues", async () => {
  const { ctx } = ctxWithKeys(ENTER);
  const result = await multiselectMod.multiselect(ctx, {
    message: "Features",
    options: OPTIONS,
    initialValues: ["lint", "fmt"],
    required: false,
  });
  assert.assertEquals(result, ["lint", "fmt"]);
});

Deno.test("multiselect skips disabled options on toggle", async () => {
  const { ctx } = ctxWithKeys(DOWN, SPACE, ENTER);
  const result = await multiselectMod.multiselect(ctx, {
    message: "Features",
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B", disabled: true },
      { value: "c", label: "C" },
    ],
    required: false,
  });
  // Down skips disabled B, lands on C, Space selects C
  assert.assertEquals(result, ["c"]);
});

Deno.test("multiselect renders done state with labels", async () => {
  const { ctx, getOutput } = ctxWithKeys(SPACE, ENTER);
  await multiselectMod.multiselect(ctx, {
    message: "Pick features",
    options: OPTIONS,
    required: false,
  });
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Pick features");
  assert.assertStringIncludes(out, "TypeScript");
  assert.assertStringIncludes(out, "◇"); // done symbol
});
