// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * OpenCode adapter — binary discovery only.
 *
 * @module
 */

import * as adapter from "../adapter.ts";
import type { AgentAdapter } from "../adapter.ts";

/** Adapter for OpenCode: looks for `opencode` on PATH. */
export const opencodeAdapter: AgentAdapter = adapter.createCliAgentAdapter({
  id: "opencode",
  displayName: "OpenCode",
  candidates: ["opencode"],
});
