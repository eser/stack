// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Codex CLI adapter. Generic interactive-CLI matchers; tune as the Codex TUI
 * stabilises.
 *
 * @module
 */

import { type AgentAdapter, createCliAgentAdapter } from "../adapter.ts";

export const codexAdapter: AgentAdapter = createCliAgentAdapter({
  id: "codex",
  displayName: "Codex",
  candidates: ["codex"],
  matchers: {
    busy: /thinking|working|generating|esc to (?:cancel|interrupt)/i,
    awaitingInput: /\(y\/n\)|\[y\/n\]|allow command|approve\?|proceed\?/i,
    promptReady: /^\s*>\s*$|[│|]\s*>/m,
  },
  submit: "\r",
});
