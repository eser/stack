// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as types from "./types.ts";
import * as logMod from "./log.ts";

// =============================================================================
// intro
// =============================================================================

Deno.test("intro renders bar start with bold title", async () => {
  const { ctx, getOutput } = types.createTestContext();
  logMod.intro(ctx, "create-my-app");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "create-my-app");
  assert.assertStringIncludes(out, "┌");
});

// =============================================================================
// outro
// =============================================================================

Deno.test("outro renders bar end with message", async () => {
  const { ctx, getOutput } = types.createTestContext();
  logMod.outro(ctx, "You're all set!");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "You're all set!");
  assert.assertStringIncludes(out, "└");
});

// =============================================================================
// log.info
// =============================================================================

Deno.test("log.info renders info alert", async () => {
  const { ctx, getOutput } = types.createTestContext();
  logMod.log.info(ctx, "Processing files...");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Processing files...");
  assert.assertStringIncludes(out, "[INFO]");
});

// =============================================================================
// log.success
// =============================================================================

Deno.test("log.success renders success alert", async () => {
  const { ctx, getOutput } = types.createTestContext();
  logMod.log.success(ctx, "All done!");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "All done!");
  assert.assertStringIncludes(out, "[OK]");
});

// =============================================================================
// log.warn
// =============================================================================

Deno.test("log.warn renders warning alert", async () => {
  const { ctx, getOutput } = types.createTestContext();
  logMod.log.warn(ctx, "Disk almost full");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Disk almost full");
  assert.assertStringIncludes(out, "[WARN]");
});

// =============================================================================
// log.error
// =============================================================================

Deno.test("log.error renders error alert", async () => {
  const { ctx, getOutput } = types.createTestContext();
  logMod.log.error(ctx, "Build failed");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Build failed");
  assert.assertStringIncludes(out, "[ERROR]");
});

// =============================================================================
// log.step
// =============================================================================

Deno.test("log.step renders step with done symbol", async () => {
  const { ctx, getOutput } = types.createTestContext();
  logMod.log.step(ctx, "Step 1 of 3");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Step 1 of 3");
  assert.assertStringIncludes(out, "◇");
});

// =============================================================================
// log.message
// =============================================================================

Deno.test("log.message renders with default bar symbol", async () => {
  const { ctx, getOutput } = types.createTestContext();
  logMod.log.message(ctx, "Hello world");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Hello world");
  assert.assertStringIncludes(out, "│");
});

Deno.test("log.message renders with custom symbol", async () => {
  const { ctx, getOutput } = types.createTestContext();
  logMod.log.message(ctx, "Custom", "~");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "Custom");
  assert.assertStringIncludes(out, "~");
});

// =============================================================================
// Combined flow
// =============================================================================

Deno.test("intro + log + outro produces connected output", async () => {
  const { ctx, getOutput } = types.createTestContext();
  logMod.intro(ctx, "my-cli");
  logMod.log.info(ctx, "Working...");
  logMod.log.success(ctx, "Done!");
  logMod.outro(ctx, "Goodbye!");
  await ctx.output.flush();
  const out = getOutput();
  assert.assertStringIncludes(out, "┌");
  assert.assertStringIncludes(out, "my-cli");
  assert.assertStringIncludes(out, "Working...");
  assert.assertStringIncludes(out, "Done!");
  assert.assertStringIncludes(out, "└");
  assert.assertStringIncludes(out, "Goodbye!");
});
