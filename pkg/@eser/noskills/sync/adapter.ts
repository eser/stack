// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tool adapter interface — defines the contract each coding-tool adapter must
 * implement so the sync engine can orchestrate rule, hook, agent, spec, and
 * MCP generation uniformly.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";

// =============================================================================
// Capabilities
// =============================================================================

/** How a tool presents interactive choices and delegates to sub-agents. */
export type InteractionHints = {
  /** Whether the tool has an AskUserQuestion-style tool (Claude Code: true). */
  readonly hasAskUserTool: boolean;
  /** How to present options: "tool" uses AskUserQuestion, "prose" uses numbered lists. */
  readonly optionPresentation: "tool" | "prose";
  /** Whether the tool can delegate work to sub-agents. */
  readonly hasSubAgentDelegation: boolean;
  /** Mechanism for spawning sub-agents. */
  readonly subAgentMethod: "task" | "delegation" | "none";
};

/** Boolean flags describing what a tool adapter can generate. */
export type ToolCapabilities = {
  readonly rules: boolean;
  readonly hooks: boolean;
  readonly agents: boolean;
  readonly specs: boolean;
  readonly mcp: boolean;
  readonly interaction: InteractionHints;
};

// =============================================================================
// Context & Options
// =============================================================================

/** Shared parameters every handler receives. */
export type SyncContext = {
  readonly root: string;
  readonly rules: readonly string[];
  readonly commandPrefix: string;
};

/** Tool-specific options (e.g. Claude Code's `allowGit`). */
export type SyncOptions = {
  readonly allowGit?: boolean;
};

// =============================================================================
// Adapter Interface
// =============================================================================

/** Contract that every coding-tool adapter must satisfy. */
export interface ToolAdapter {
  /** Which coding tool this adapter serves. */
  readonly id: schema.CodingToolId;

  /** What this adapter is capable of generating. */
  readonly capabilities: ToolCapabilities;

  /** Generate rule / instruction files (required — all tools produce these). */
  syncRules(ctx: SyncContext, options?: SyncOptions): Promise<void>;

  /** Generate hook configurations (optional). */
  syncHooks?(ctx: SyncContext, options?: SyncOptions): Promise<void>;

  /** Generate agent configurations (optional). */
  syncAgents?(ctx: SyncContext, options?: SyncOptions): Promise<void>;

  /** Generate project-spec artifacts (optional). */
  syncSpecs?(ctx: SyncContext, specPath: string): Promise<void>;

  /** Generate MCP configuration (optional). */
  syncMcp?(ctx: SyncContext): Promise<void>;
}
