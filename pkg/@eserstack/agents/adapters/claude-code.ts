// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Claude Code adapter — ports the discovery the noskills manager used
 * (`which claude || which claude-code`).
 *
 * @module
 */

import { type AgentAdapter, createCliAgentAdapter } from "../adapter.ts";

export const claudeCodeAdapter: AgentAdapter = createCliAgentAdapter({
  id: "claude-code",
  displayName: "Claude Code",
  candidates: ["claude", "claude-code"],
});
