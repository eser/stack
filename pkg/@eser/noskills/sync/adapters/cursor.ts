// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cursor adapter — implements ToolAdapter for Cursor, delegating to the
 * existing cursor.ts sync module.
 *
 * @module
 */

import type * as adapter from "../adapter.ts";
import * as cursor from "../cursor.ts";

export const cursorAdapter: adapter.ToolAdapter = {
  id: "cursor",
  capabilities: {
    rules: true,
    hooks: false,
    agents: false,
    specs: false,
    mcp: false,
  },
  async syncRules(ctx: adapter.SyncContext): Promise<void> {
    await cursor.sync(ctx.root, ctx.rules, ctx.commandPrefix);
  },
};
