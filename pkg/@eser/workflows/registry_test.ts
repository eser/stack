// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import type { WorkflowTool } from "./types.ts";
import { createRegistry } from "./registry.ts";

const dummyTool = (name: string): WorkflowTool => ({
  name,
  description: `dummy ${name}`,
  run: () =>
    Promise.resolve({
      name,
      passed: true,
      issues: [],
      mutations: [],
      stats: {},
    }),
});

Deno.test("createRegistry — register, get, has, names", () => {
  const reg = createRegistry();

  assert.assertEquals(reg.has("foo"), false);
  assert.assertEquals(reg.get("foo"), undefined);
  assert.assertEquals(reg.names().length, 0);

  const tool = dummyTool("foo");
  reg.register(tool);

  assert.assertEquals(reg.has("foo"), true);
  assert.assertEquals(reg.get("foo"), tool);
  assert.assertEquals(reg.names(), ["foo"]);
});

Deno.test("createRegistry — registerAll + getAll", () => {
  const reg = createRegistry();
  const tools = [dummyTool("a"), dummyTool("b"), dummyTool("c")];

  reg.registerAll(tools);

  assert.assertEquals(reg.names().length, 3);
  assert.assertEquals(reg.has("a"), true);
  assert.assertEquals(reg.has("b"), true);
  assert.assertEquals(reg.has("c"), true);

  const all = reg.getAll();
  assert.assertEquals(all.length, 3);
  // getAll returns all tools (order is insertion order for Map)
  assert.assertEquals(
    all.map((t) => t.name),
    ["a", "b", "c"],
  );
});
