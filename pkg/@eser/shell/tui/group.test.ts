// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as types from "./types.ts";
import * as groupMod from "./group.ts";

Deno.test("group collects results from all prompts", async () => {
  const { ctx } = types.createTestContext();
  const result = await groupMod.group(ctx, {
    name: () => Promise.resolve("Alice"),
    age: () => Promise.resolve(30),
  });
  assert.assertEquals(result, { name: "Alice", age: 30 });
});

Deno.test("group passes partial results to subsequent prompts", async () => {
  const { ctx } = types.createTestContext();
  let capturedResults: Record<string, unknown> = {};

  const result = await groupMod.group(ctx, {
    name: () => Promise.resolve("Bob"),
    greeting: ({ results }) => {
      capturedResults = { ...results };
      return Promise.resolve(`Hello ${results["name"]}`);
    },
  });

  assert.assertEquals(capturedResults, { name: "Bob" });
  assert.assertEquals(result, {
    name: "Bob",
    greeting: "Hello Bob",
  });
});

Deno.test("group returns CANCEL if any prompt cancels", async () => {
  const { ctx } = types.createTestContext();
  const result = await groupMod.group(ctx, {
    name: () => Promise.resolve("Charlie"),
    confirm: () => Promise.resolve(types.CANCEL),
    // This should not be reached
    extra: () => Promise.resolve("never"),
  });
  assert.assertEquals(types.isCancel(result), true);
});

Deno.test("group calls onCancel callback on cancellation", async () => {
  const { ctx } = types.createTestContext();
  let cancelled = false;

  await groupMod.group(
    ctx,
    {
      step1: () => Promise.resolve(types.CANCEL),
    },
    {
      onCancel: () => {
        cancelled = true;
      },
    },
  );

  assert.assertEquals(cancelled, true);
});

Deno.test("group does not call onCancel on success", async () => {
  const { ctx } = types.createTestContext();
  let cancelled = false;

  await groupMod.group(
    ctx,
    {
      step1: () => Promise.resolve("ok"),
    },
    {
      onCancel: () => {
        cancelled = true;
      },
    },
  );

  assert.assertEquals(cancelled, false);
});

Deno.test("group with empty prompts returns empty object", async () => {
  const { ctx } = types.createTestContext();
  const result = await groupMod.group(ctx, {});
  assert.assertEquals(result, {});
});

Deno.test("group stops at first cancellation", async () => {
  const { ctx } = types.createTestContext();
  const executed: string[] = [];

  await groupMod.group(ctx, {
    a: () => {
      executed.push("a");
      return Promise.resolve(1);
    },
    b: () => {
      executed.push("b");
      return Promise.resolve(types.CANCEL);
    },
    c: () => {
      executed.push("c");
      return Promise.resolve(3);
    },
  });

  assert.assertEquals(executed, ["a", "b"]);
});
