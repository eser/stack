// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * OpenCode adapter — binary discovery only.
 *
 * @module
 */

import { type AgentAdapter, createCliAgentAdapter } from "../adapter.ts";

export const opencodeAdapter: AgentAdapter = createCliAgentAdapter({
  id: "opencode",
  displayName: "OpenCode",
  candidates: ["opencode"],
});
