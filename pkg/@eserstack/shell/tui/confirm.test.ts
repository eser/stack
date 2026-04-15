// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as types from "./types.ts";
import * as confirmMod from "./confirm.ts";

// Helper: create a context with pre-loaded key sequence
const ctxWithKeys = (
  ...keys: Uint8Array[]
): ReturnType<typeof types.createTestContext> => {
  const test = types.createTestContext();

  // Push keys with a small delay between them via microtask scheduling
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
const LEFT = new Uint8Array([0x1b, 0x5b, 0x44]);
const RIGHT = new Uint8Array([0x1b, 0x5b, 0x43]);
const KEY_Y = new Uint8Array([0x79]);
const KEY_N = new Uint8Array([0x6e]);

Deno.test("confirm returns true by default on Enter", async () => {
  const { ctx } = ctxWithKeys(ENTER);
  const result = await confirmMod.confirm(ctx, { message: "Continue?" });
  assert.assertEquals(result, true);
});

Deno.test("confirm returns false when initialValue is false and Enter", async () => {
  const { ctx } = ctxWithKeys(ENTER);
  const result = await confirmMod.confirm(ctx, {
    message: "Continue?",
    initialValue: false,
  });
  assert.assertEquals(result, false);
});

Deno.test("confirm returns false after pressing 'n' then Enter", async () => {
  const { ctx } = ctxWithKeys(KEY_N, ENTER);
  const result = await confirmMod.confirm(ctx, { message: "Delete?" });
  assert.assertEquals(result, false);
});

Deno.test("confirm returns true after pressing 'y' then Enter", async () => {
  const { ctx } = ctxWithKeys(KEY_Y, ENTER);
  const result = await confirmMod.confirm(ctx, {
    message: "Deploy?",
    initialValue: false,
  });
  assert.assertEquals(result, true);
});

Deno.test("confirm toggles to false with right arrow", async () => {
  // Start true, press right (toggles to false), enter
  const { ctx } = ctxWithKeys(RIGHT, ENTER);
  const result = await confirmMod.confirm(ctx, { message: "Toggle?" });
  assert.assertEquals(result, false);
});

Deno.test("confirm toggles back with left arrow", async () => {
  // Start true, right (false), left (true), enter
  const { ctx } = ctxWithKeys(RIGHT, LEFT, ENTER);
  const result = await confirmMod.confirm(ctx, { message: "Toggle?" });
  assert.assertEquals(result, true);
});

Deno.test("confirm returns CANCEL on Escape", async () => {
  const { ctx } = ctxWithKeys(ESCAPE);
  const result = await confirmMod.confirm(ctx, { message: "Cancel?" });
  assert.assertEquals(types.isCancel(result), true);
});

Deno.test("confirm renders done state with answer", async () => {
  const { ctx, getOutput } = ctxWithKeys(ENTER);
  await confirmMod.confirm(ctx, { message: "Proceed?" });
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Proceed?");
  assert.assertStringIncludes(out, "◇"); // done symbol
});

Deno.test("confirm renders cancel state on escape", async () => {
  const { ctx, getOutput } = ctxWithKeys(ESCAPE);
  await confirmMod.confirm(ctx, { message: "Cancel test" });
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Cancel test");
  assert.assertStringIncludes(out, "■"); // cancel symbol
});
