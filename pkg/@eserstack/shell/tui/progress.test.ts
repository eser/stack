// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as types from "./types.ts";
import * as progressMod from "./progress.ts";

Deno.test("createProgress returns handle with all methods", () => {
  const { ctx } = types.createTestContext();
  const p = progressMod.createProgress(ctx, { total: 100 });
  assert.assertEquals(typeof p.start, "function");
  assert.assertEquals(typeof p.advance, "function");
  assert.assertEquals(typeof p.stop, "function");
});

Deno.test("progress.start renders initial label", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const p = progressMod.createProgress(ctx, {
    total: 100,
    label: "Downloading",
  });
  p.start();
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Downloading");
});

Deno.test("progress.start with override label", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const p = progressMod.createProgress(ctx, { total: 100, label: "Original" });
  p.start("Override");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Override");
});

Deno.test("progress.advance updates gauge percentage", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const p = progressMod.createProgress(ctx, { total: 100 });
  p.start("Working");
  p.advance(50);
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "50%");
});

Deno.test("progress.advance with new label", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const p = progressMod.createProgress(ctx, { total: 10 });
  p.start("Step 1");
  p.advance(3, "Step 2");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Step 2");
  assert.assertStringIncludes(out, "30%");
});

Deno.test("progress.stop renders 100%", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const p = progressMod.createProgress(ctx, { total: 50 });
  p.start("Loading");
  p.advance(25);
  p.stop("Done!");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "100%");
  assert.assertStringIncludes(out, "Done!");
});

Deno.test("progress.advance does not exceed total", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const p = progressMod.createProgress(ctx, { total: 10 });
  p.start("Working");
  p.advance(999);
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "100%");
});

Deno.test("progress with custom width", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const p = progressMod.createProgress(ctx, { total: 100, width: 10 });
  p.start("Small bar");
  p.advance(50);
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "50%");
});

Deno.test("progress.advance before start is no-op", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const p = progressMod.createProgress(ctx, { total: 100 });
  p.advance(50); // should not throw or render
  await ctx.output.flush();
  const out = getOutput();
  assert.assertEquals(out, "");
});
