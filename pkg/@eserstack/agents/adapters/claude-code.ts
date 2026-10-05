// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Claude Code adapter — ports the discovery the noskills manager used
 * (`which claude || which claude-code`).
 *
 * @module
 */

import * as adapter from "../adapter.ts";
import type { AgentAdapter } from "../adapter.ts";

/** Adapter for Claude Code: looks for `claude`, then `claude-code` on PATH. */
export const claudeCodeAdapter: AgentAdapter = adapter.createCliAgentAdapter({
  id: "claude-code",
  displayName: "Claude Code",
  candidates: ["claude", "claude-code"],
});
