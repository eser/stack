// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * OpenCode adapter. Generic interactive-CLI matchers; tune as the OpenCode TUI
 * stabilises.
 *
 * @module
 */

import { type AgentAdapter, createCliAgentAdapter } from "../adapter.ts";

export const opencodeAdapter: AgentAdapter = createCliAgentAdapter({
  id: "opencode",
  displayName: "OpenCode",
  candidates: ["opencode"],
  matchers: {
    busy: /thinking|working|generating|running…|esc to (?:cancel|interrupt)/i,
    awaitingInput: /\(y\/n\)|\[y\/n\]|confirm\b|proceed\?/i,
    promptReady: /^\s*>\s*$|[│|]\s*>/m,
  },
  submit: "\r",
});
