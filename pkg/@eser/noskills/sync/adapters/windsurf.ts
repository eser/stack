// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Windsurf adapter — implements ToolAdapter for Windsurf, delegating to the
 * existing windsurf.ts sync module.
 *
 * @module
 */

import type * as adapter from "../adapter.ts";
import * as windsurf from "../windsurf.ts";

export const windsurfAdapter: adapter.ToolAdapter = {
  id: "windsurf",
  capabilities: {
    rules: true,
    hooks: false,
    agents: false,
    specs: false,
    mcp: false,
  },
  async syncRules(ctx: adapter.SyncContext): Promise<void> {
    await windsurf.sync(ctx.root, ctx.rules, ctx.commandPrefix);
  },
};
