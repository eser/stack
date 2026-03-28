// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as types from "./types.ts";
import * as selectMod from "./select.ts";

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
const DOWN = new Uint8Array([0x1b, 0x5b, 0x42]);
const UP = new Uint8Array([0x1b, 0x5b, 0x41]);

const OPTIONS = [
  { value: "next", label: "Next.js" },
  { value: "svelte", label: "SvelteKit" },
  { value: "astro", label: "Astro", hint: "recommended" },
] as const;

Deno.test("select returns first option on immediate Enter", async () => {
  const { ctx } = ctxWithKeys(ENTER);
  const result = await selectMod.select(ctx, {
    message: "Pick a framework",
    options: OPTIONS,
  });
  assert.assertEquals(result, "next");
});

Deno.test("select returns second option after Down + Enter", async () => {
  const { ctx } = ctxWithKeys(DOWN, ENTER);
  const result = await selectMod.select(ctx, {
    message: "Pick a framework",
    options: OPTIONS,
  });
  assert.assertEquals(result, "svelte");
});

Deno.test("select returns third option after Down Down Enter", async () => {
  const { ctx } = ctxWithKeys(DOWN, DOWN, ENTER);
  const result = await selectMod.select(ctx, {
    message: "Pick a framework",
    options: OPTIONS,
  });
  assert.assertEquals(result, "astro");
});

Deno.test("select wraps around from last to first", async () => {
  const { ctx } = ctxWithKeys(DOWN, DOWN, DOWN, ENTER);
  const result = await selectMod.select(ctx, {
    message: "Pick",
    options: OPTIONS,
  });
  assert.assertEquals(result, "next");
});

Deno.test("select wraps around from first to last with Up", async () => {
  const { ctx } = ctxWithKeys(UP, ENTER);
  const result = await selectMod.select(ctx, {
    message: "Pick",
    options: OPTIONS,
  });
  assert.assertEquals(result, "astro");
});

Deno.test("select respects initialValue", async () => {
  const { ctx } = ctxWithKeys(ENTER);
  const result = await selectMod.select(ctx, {
    message: "Pick",
    options: OPTIONS,
    initialValue: "svelte",
  });
  assert.assertEquals(result, "svelte");
});

Deno.test("select skips disabled options", async () => {
  const { ctx } = ctxWithKeys(DOWN, ENTER);
  const result = await selectMod.select(ctx, {
    message: "Pick",
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B", disabled: true },
      { value: "c", label: "C" },
    ],
  });
  assert.assertEquals(result, "c");
});

Deno.test("select returns CANCEL on Escape", async () => {
  const { ctx } = ctxWithKeys(ESCAPE);
  const result = await selectMod.select(ctx, {
    message: "Pick",
    options: OPTIONS,
  });
  assert.assertEquals(types.isCancel(result), true);
});

Deno.test("select renders done state with selected label", async () => {
  const { ctx, getOutput } = ctxWithKeys(DOWN, ENTER);
  await selectMod.select(ctx, { message: "Framework?", options: OPTIONS });
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Framework?");
  assert.assertStringIncludes(out, "SvelteKit");
  assert.assertStringIncludes(out, "◇"); // done symbol
});

Deno.test("select supports j/k vim keys", async () => {
  const KEY_J = new Uint8Array([0x6a]);
  const { ctx } = ctxWithKeys(KEY_J, ENTER);
  const result = await selectMod.select(ctx, {
    message: "Pick",
    options: OPTIONS,
  });
  assert.assertEquals(result, "svelte");
});
