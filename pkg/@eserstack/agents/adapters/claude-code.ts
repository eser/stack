// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Claude Code adapter — ports the discovery the noskills manager used
 * (`which claude || which claude-code`). State matchers are heuristics over the
 * Claude Code TUI and are tunable.
 *
 * @module
 */

import { type AgentAdapter, createCliAgentAdapter } from "../adapter.ts";

export const claudeCodeAdapter: AgentAdapter = createCliAgentAdapter({
  id: "claude-code",
  displayName: "Claude Code",
  candidates: ["claude", "claude-code"],
  matchers: {
    // The status line shows an interrupt hint / spinner while working.
    busy: /esc to interrupt|·\s*\(|Thinking…|Working…|Forging…/i,
    // Permission prompts and option menus use a ❯ selector or (y/n).
    awaitingInput: /Do you want to proceed|❯\s|\(y\/n\)|\b1\.\s.+\n.*\b2\.\s/i,
    // The composer box renders a "> " prompt.
    promptReady: /[│|╰]\s*>|^\s*>\s*$/m,
  },
  submit: "\r",
});
