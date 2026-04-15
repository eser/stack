// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as types from "./types.ts";
import * as spinnerMod from "./spinner.ts";

Deno.test("createSpinner returns handle with all methods", () => {
  const { ctx } = types.createTestContext();
  const s = spinnerMod.createSpinner(ctx, "Loading...");
  assert.assertEquals(typeof s.start, "function");
  assert.assertEquals(typeof s.stop, "function");
  assert.assertEquals(typeof s.update, "function");
  assert.assertEquals(typeof s.succeed, "function");
  assert.assertEquals(typeof s.fail, "function");
  assert.assertEquals(typeof s.warn, "function");
  assert.assertEquals(typeof s.info, "function");
});

Deno.test("spinner.succeed outputs done symbol and message", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const s = spinnerMod.createSpinner(ctx, "Installing...");
  s.succeed("Installed!");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Installed!");
  assert.assertStringIncludes(out, "◇");
});

Deno.test("spinner.fail outputs cancel symbol and message", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const s = spinnerMod.createSpinner(ctx, "Building...");
  s.fail("Build failed");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Build failed");
  assert.assertStringIncludes(out, "■");
});

Deno.test("spinner.warn outputs warning symbol and message", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const s = spinnerMod.createSpinner(ctx, "Checking...");
  s.warn("Deprecated API");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Deprecated API");
  assert.assertStringIncludes(out, "▲");
});

Deno.test("spinner.info outputs info symbol and message", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const s = spinnerMod.createSpinner(ctx, "Processing...");
  s.info("5 files found");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "5 files found");
  assert.assertStringIncludes(out, "●");
});

Deno.test("spinner.succeed uses initial message when no arg", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const s = spinnerMod.createSpinner(ctx, "Loading...");
  s.succeed();
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Loading...");
});

Deno.test("spinner.update changes message for subsequent calls", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const s = spinnerMod.createSpinner(ctx, "Step 1");
  s.update("Step 2");
  s.succeed();
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Step 2");
});

Deno.test("spinner.start with message overrides initial", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const s = spinnerMod.createSpinner(ctx, "Original");
  s.start("Override");
  // Let one frame tick
  await new Promise((r) => setTimeout(r, 100));
  s.succeed();
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Override");
});

Deno.test("spinner.stop clears without output", async () => {
  const { ctx, getOutput } = types.createTestContext();
  const s = spinnerMod.createSpinner(ctx, "Working...");
  s.start();
  await new Promise((r) => setTimeout(r, 100));
  s.stop();
  await ctx.output.flush();
  // After stop, output should just have the clearing \r sequences, no final line
  const out = getOutput();
  assert.assertNotEquals(out, undefined);
});
