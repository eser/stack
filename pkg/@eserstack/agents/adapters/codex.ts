// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Codex adapter — binary discovery only.
 *
 * @module
 */

import * as adapter from "../adapter.ts";
import type { AgentAdapter } from "../adapter.ts";

/** Adapter for Codex: looks for `codex` on PATH. */
export const codexAdapter: AgentAdapter = adapter.createCliAgentAdapter({
  id: "codex",
  displayName: "Codex",
  candidates: ["codex"],
});
