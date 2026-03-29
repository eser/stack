// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * GitHub Copilot adapter — implements ToolAdapter for Copilot, delegating to
 * the existing copilot.ts sync module.
 *
 * @module
 */

import type * as adapter from "../adapter.ts";
import * as copilot from "../copilot.ts";

export const copilotAdapter: adapter.ToolAdapter = {
  id: "copilot",
  capabilities: {
    rules: true,
    hooks: false,
    agents: false,
    specs: false,
    mcp: false,
  },
  async syncRules(ctx: adapter.SyncContext): Promise<void> {
    await copilot.sync(ctx.root, ctx.rules, ctx.commandPrefix);
  },
};
