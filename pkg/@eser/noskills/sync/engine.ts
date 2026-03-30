// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Sync engine — regenerates tool-specific instruction files from .eser/rules/.
 * Dispatches to ToolAdapter instances instead of special-casing individual tools.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import type * as adapter from "./adapter.ts";
import * as persistence from "../state/persistence.ts";
import * as claudeCodeAdapterMod from "./adapters/claude-code.ts";
import * as cursorAdapterMod from "./adapters/cursor.ts";
import * as kiroAdapterMod from "./adapters/kiro.ts";
import * as copilotAdapterMod from "./adapters/copilot.ts";
import * as windsurfAdapterMod from "./adapters/windsurf.ts";
import * as opencodeAdapterMod from "./adapters/opencode.ts";
import * as codexAdapterMod from "./adapters/codex.ts";
import * as copilotCliAdapterMod from "./adapters/copilot-cli.ts";
import * as cmd from "../output/cmd.ts";
import * as crossRuntime from "@eser/standards/cross-runtime";

// =============================================================================
// Rule Loading
// =============================================================================

export const loadRules = async (root: string): Promise<readonly string[]> => {
  const rulesDir = `${root}/${persistence.paths.rulesDir}`;
  const rules: string[] = [];

  try {
    for await (const entry of crossRuntime.runtime.fs.readDir(rulesDir)) {
      if (
        entry.isFile &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))
      ) {
        const content = await crossRuntime.runtime.fs.readTextFile(
          `${rulesDir}/${entry.name}`,
        );
        // Use first line as the rule summary for bullet rendering
        const firstLine = content.trim().split("\n")[0] ?? content.trim();
        rules.push(firstLine);
      }
    }
  } catch {
    // No rules yet
  }

  return rules;
};

// =============================================================================
// Adapter Registry
// =============================================================================

const ADAPTERS: readonly adapter.ToolAdapter[] = [
  claudeCodeAdapterMod.claudeCodeAdapter,
  cursorAdapterMod.cursorAdapter,
  kiroAdapterMod.kiroAdapter,
  copilotAdapterMod.copilotAdapter,
  windsurfAdapterMod.windsurfAdapter,
  opencodeAdapterMod.opencodeAdapter,
  codexAdapterMod.codexAdapter,
  copilotCliAdapterMod.copilotCliAdapter,
];

// =============================================================================
// Active Tool Resolution
// =============================================================================

/** Default interaction hints (Claude Code behavior) used when no tool is configured. */
const DEFAULT_INTERACTION: adapter.InteractionHints = {
  hasAskUserTool: true,
  optionPresentation: "tool",
  hasSubAgentDelegation: true,
  subAgentMethod: "task",
};

/**
 * Resolve the interaction hints for the primary active tool.
 *
 * Uses the first tool in the manifest's tools list. Falls back to Claude Code
 * defaults if no tools are configured or the tool ID is unknown.
 */
export const resolveInteractionHints = (
  tools: readonly schema.CodingToolId[],
): adapter.InteractionHints => {
  const primaryId = tools[0];

  if (primaryId === undefined) {
    return DEFAULT_INTERACTION;
  }

  const found = ADAPTERS.find((a) => a.id === primaryId);

  return found?.capabilities.interaction ?? DEFAULT_INTERACTION;
};

// =============================================================================
// Sync
// =============================================================================

export const syncAll = async (
  root: string,
  tools: readonly schema.CodingToolId[],
  config?: schema.NosManifest | null,
): Promise<readonly string[]> => {
  const rules = await loadRules(root);
  const synced: string[] = [];
  const syncOptions: adapter.SyncOptions = {
    allowGit: config?.allowGit ?? false,
  };
  const commandPrefix = config?.command ?? "npx eser@latest noskills";
  cmd.setCommandPrefix(commandPrefix);

  for (const toolId of tools) {
    const found = ADAPTERS.find((a) => a.id === toolId);

    if (found === undefined) {
      continue;
    }

    const ctx: adapter.SyncContext = { root, rules, commandPrefix };

    await found.syncRules(ctx, syncOptions);

    if (found.capabilities.hooks && found.syncHooks !== undefined) {
      await found.syncHooks(ctx, syncOptions);
    }

    if (found.capabilities.agents && found.syncAgents !== undefined) {
      await found.syncAgents(ctx, syncOptions);
    }

    if (found.capabilities.specs && found.syncSpecs !== undefined) {
      const specsDir = `${root}/${persistence.paths.specsDir}`;

      try {
        for await (
          const entry of crossRuntime.runtime.fs.readDir(specsDir)
        ) {
          if (entry.isDirectory) {
            const specPath = `${specsDir}/${entry.name}/spec.md`;
            await found.syncSpecs(ctx, specPath);
          }
        }
      } catch {
        // No specs directory yet
      }
    }

    if (found.capabilities.mcp && found.syncMcp !== undefined) {
      await found.syncMcp(ctx);
    }

    synced.push(toolId);
  }

  // Preserve the "hooks" marker in the synced list for backward compatibility
  if (tools.includes("claude-code")) {
    synced.push("hooks");
  }

  return synced;
};
