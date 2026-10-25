// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as actionRegistry from "./action-registry.ts";

Deno.test("invokeAction returns the action's result", async () => {
  actionRegistry.clearActions();
  actionRegistry.registerAction(
    "actions.ts#add",
    (a, b) => Promise.resolve(Number(a) + Number(b)),
  );

  assert.assertEquals(
    await actionRegistry.invokeAction("actions.ts#add", [2, 3]),
    5,
  );
});

Deno.test("invokeAction rejects an unknown id with the id and the fix", async () => {
  actionRegistry.clearActions();

  const error = await assert.assertRejects(
    () => actionRegistry.invokeAction("actions.ts#missing", []),
    actionRegistry.ServerActionError,
    "registerAction()",
  );

  assert.assertEquals(error.actionId, "actions.ts#missing");
  assert.assertStringIncludes(error.message, '"actions.ts#missing"');
});

Deno.test("invokeAction wraps the action's error as the cause", async () => {
  actionRegistry.clearActions();
  const original = new RangeError("quantity must be positive");
  actionRegistry.registerAction(
    "actions.ts#order",
    () => Promise.reject(original),
  );

  const error = await assert.assertRejects(
    () => actionRegistry.invokeAction("actions.ts#order", [-1]),
    actionRegistry.ServerActionError,
    'invoke server action "actions.ts#order"',
  );

  assert.assertEquals(error.actionId, "actions.ts#order");
  assert.assertStrictEquals(error.cause, original);
});
