// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Codex adapter — binary discovery only.
 *
 * @module
 */

import { type AgentAdapter, createCliAgentAdapter } from "../adapter.ts";

export const codexAdapter: AgentAdapter = createCliAgentAdapter({
  id: "codex",
  displayName: "Codex",
  candidates: ["codex"],
});
