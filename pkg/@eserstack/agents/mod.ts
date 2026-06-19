// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `@eserstack/agents` — runtime adapters for interactive coding agents and an
 * autonomous driving loop.
 *
 * An {@link AgentAdapter} knows how to discover, launch, and read the state of a
 * coding agent (Claude Code, OpenCode, Codex); the driving loop reads a pane's
 * terminal and injects gated messages. Pairs with `@eserstack/mux` (which owns
 * panes/PTYs) and reuses the shared git guard for safety.
 *
 * @module
 */

export type {
  AgentAdapter,
  AgentCapabilities,
  AgentState,
  CliAdapterOptions,
  SpawnContext,
  SpawnSpec,
  StateMatchers,
  TerminalView,
} from "./adapter.ts";
export {
  createCliAgentAdapter,
  detectStateFromMatchers,
  isOnPath,
  resolveFirstOnPath,
  terminalTail,
} from "./adapter.ts";

export {
  defaultAgentAdapter,
  getAgentAdapter,
  listAgentAdapters,
} from "./registry.ts";
export { claudeCodeAdapter } from "./adapters/claude-code.ts";
export { opencodeAdapter } from "./adapters/opencode.ts";
export { codexAdapter } from "./adapters/codex.ts";

export * as drive from "./drive/mod.ts";
export * as gitGuard from "./guards/git.ts";
