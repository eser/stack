// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `@eserstack/agents` — binary discovery and spawn specs for interactive coding
 * agents.
 *
 * An {@link AgentAdapter} knows how to find and launch a coding agent (Claude
 * Code, OpenCode, Codex). Pairs with `@eserstack/mux`, which owns panes and
 * PTYs, and reuses the shared git guard.
 *
 * The autonomous driving loop that used to live here is gone, along with the
 * regex state matchers it depended on: an agent's state now arrives as ACP
 * session/update events reported by the agent itself, rather than being guessed
 * from the last ten rows of its TUI.
 *
 * @module
 */

export type {
  AgentAdapter,
  AgentCapabilities,
  CliAdapterOptions,
  SpawnContext,
  SpawnSpec,
} from "./adapter.ts";
export {
  createCliAgentAdapter,
  isOnPath,
  resolveFirstOnPath,
} from "./adapter.ts";

export {
  defaultAgentAdapter,
  getAgentAdapter,
  listAgentAdapters,
} from "./registry.ts";
export { claudeCodeAdapter } from "./adapters/claude-code.ts";
export { opencodeAdapter } from "./adapters/opencode.ts";
export { codexAdapter } from "./adapters/codex.ts";

export * as gitGuard from "./guards/git.ts";
