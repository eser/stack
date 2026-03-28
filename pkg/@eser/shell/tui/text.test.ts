// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as types from "./types.ts";
import * as textMod from "./text.ts";

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
const BACKSPACE = new Uint8Array([0x7f]);
const charKey = (c: string): Uint8Array => new TextEncoder().encode(c);

Deno.test("text returns empty string on immediate Enter", async () => {
  const { ctx } = ctxWithKeys(ENTER);
  const result = await textMod.text(ctx, { message: "Name?" });
  assert.assertEquals(result, "");
});

Deno.test("text returns typed characters on Enter", async () => {
  const { ctx } = ctxWithKeys(
    charKey("h"),
    charKey("i"),
    ENTER,
  );
  const result = await textMod.text(ctx, { message: "Name?" });
  assert.assertEquals(result, "hi");
});

Deno.test("text returns initialValue when no typing", async () => {
  const { ctx } = ctxWithKeys(ENTER);
  const result = await textMod.text(ctx, {
    message: "Name?",
    initialValue: "default",
  });
  assert.assertEquals(result, "default");
});

Deno.test("text backspace removes last character", async () => {
  const { ctx } = ctxWithKeys(
    charKey("a"),
    charKey("b"),
    charKey("c"),
    BACKSPACE,
    ENTER,
  );
  const result = await textMod.text(ctx, { message: "Name?" });
  assert.assertEquals(result, "ab");
});

Deno.test("text backspace on empty string is no-op", async () => {
  const { ctx } = ctxWithKeys(BACKSPACE, ENTER);
  const result = await textMod.text(ctx, { message: "Name?" });
  assert.assertEquals(result, "");
});

Deno.test("text returns CANCEL on Escape", async () => {
  const { ctx } = ctxWithKeys(ESCAPE);
  const result = await textMod.text(ctx, { message: "Name?" });
  assert.assertEquals(types.isCancel(result), true);
});

Deno.test("text returns CANCEL on Ctrl+C", async () => {
  const CTRL_C = new Uint8Array([0x03]);
  const { ctx } = ctxWithKeys(CTRL_C);
  const result = await textMod.text(ctx, { message: "Name?" });
  assert.assertEquals(types.isCancel(result), true);
});

Deno.test("text validate blocks submission until valid", async () => {
  // First Enter fails validation, then type valid input, Enter succeeds
  const { ctx } = ctxWithKeys(
    ENTER, // fails: empty
    charKey("o"),
    charKey("k"),
    ENTER, // succeeds
  );
  const result = await textMod.text(ctx, {
    message: "Name?",
    validate: (v) => v.length === 0 ? "Required!" : undefined,
  });
  assert.assertEquals(result, "ok");
});

Deno.test("text validate error clears on next input", async () => {
  const { ctx, getOutput } = ctxWithKeys(
    ENTER, // fails validation
    charKey("x"),
    ENTER, // succeeds
  );
  await textMod.text(ctx, {
    message: "Name?",
    validate: (v) => v.length === 0 ? "Required!" : undefined,
  });
  await ctx.output.flush();
  const out = getOutput();
  // The final render should show done state, not the error
  assert.assertStringIncludes(out, "◇"); // done symbol
});

Deno.test("text renders done state with value", async () => {
  const { ctx, getOutput } = ctxWithKeys(
    charKey("t"),
    charKey("e"),
    charKey("s"),
    charKey("t"),
    ENTER,
  );
  await textMod.text(ctx, { message: "Input?" });
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Input?");
  assert.assertStringIncludes(out, "test");
  assert.assertStringIncludes(out, "◇");
});
