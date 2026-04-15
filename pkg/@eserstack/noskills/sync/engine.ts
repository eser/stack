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
import * as crossRuntime from "@eserstack/standards/cross-runtime";

// =============================================================================
// Rule Loading
// =============================================================================

/** A rule with optional phase and file scoping metadata. */
export type ScopedRule = {
  readonly text: string;
  readonly phases?: readonly string[];
  readonly appliesTo?: readonly string[];
};

/** Parse YAML-like frontmatter from a rule file. */
const parseFrontmatter = (
  content: string,
): { meta: Record<string, unknown>; body: string } => {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) return { meta: {}, body: trimmed };

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) return { meta: {}, body: trimmed };

  const yamlBlock = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trim();
  const meta: Record<string, unknown> = {};

  // Simple key: value parser (no YAML library dependency)
  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();

    // Parse array syntax: [a, b, c]
    if (val.startsWith("[") && val.endsWith("]")) {
      const items = val.slice(1, -1).split(",").map((s) =>
        s.trim().replace(/^["']|["']$/g, "")
      ).filter((s) => s.length > 0);
      meta[key] = items;
    } else {
      meta[key] = val.replace(/^["']|["']$/g, "");
    }
  }

  return { meta, body };
};

/** Load all rules with scoping metadata. */
export const loadScopedRules = async (
  root: string,
): Promise<readonly ScopedRule[]> => {
  const rulesDir = `${root}/${persistence.paths.rulesDir}`;
  const rules: ScopedRule[] = [];

  try {
    for await (const entry of crossRuntime.runtime.fs.readDir(rulesDir)) {
      if (
        entry.isFile &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))
      ) {
        const content = await crossRuntime.runtime.fs.readTextFile(
          `${rulesDir}/${entry.name}`,
        );
        const { meta, body } = parseFrontmatter(content);
        const firstLine = body.split("\n")[0] ?? body;

        rules.push({
          text: firstLine,
          phases: Array.isArray(meta["phases"])
            ? meta["phases"] as string[]
            : undefined,
          appliesTo: Array.isArray(meta["applies_to"])
            ? meta["applies_to"] as string[]
            : undefined,
        });
      }
    }
  } catch {
    // No rules yet
  }

  return rules;
};

/**
 * Filter scoped rules by current phase and optional file patterns.
 */
export const filterRules = (
  rules: readonly ScopedRule[],
  currentPhase: string,
  _currentFiles?: readonly string[],
): readonly string[] => {
  return rules
    .filter((r) => {
      // Phase filter: if phases set, current phase must match
      if (r.phases !== undefined && r.phases.length > 0) {
        if (!r.phases.includes(currentPhase)) return false;
      }
      // File filter: if appliesTo set, at least one file must match a glob
      // (simplified: check if any file path contains the pattern stem)
      if (
        r.appliesTo !== undefined && r.appliesTo.length > 0 &&
        _currentFiles !== undefined && _currentFiles.length > 0
      ) {
        const match = r.appliesTo.some((pat) => {
          const ext = pat.startsWith("*.") ? pat.slice(1) : null;
          if (ext !== null) {
            return _currentFiles.some((f) => f.endsWith(ext));
          }
          return _currentFiles.some((f) => f.includes(pat.replace(/\*/g, "")));
        });
        if (!match) return false;
      }
      return true;
    })
    .map((r) => r.text);
};

/** Load rules as plain strings (backward compat — no scoping). */
export const loadRules = async (root: string): Promise<readonly string[]> => {
  const scoped = await loadScopedRules(root);
  return scoped.map((r) => r.text);
};

// =============================================================================
// Two-tier rule splitting
// =============================================================================

/** Split rules into tier1 (compile-time, no file scope) and tier2 (hook-time, file-scoped). */
export const splitByTier = (
  rules: readonly ScopedRule[],
  currentPhase: string,
): { tier1: readonly string[]; tier2Count: number } => {
  const tier1: string[] = [];
  let tier2Count = 0;

  for (const r of rules) {
    // Phase filter
    if (r.phases !== undefined && r.phases.length > 0) {
      if (!r.phases.includes(currentPhase)) continue;
    }
    // Tier split: rules with appliesTo → tier2 (hook-time)
    if (r.appliesTo !== undefined && r.appliesTo.length > 0) {
      tier2Count++;
    } else {
      tier1.push(r.text);
    }
  }

  return { tier1, tier2Count };
};

/** Match a single file path against a glob pattern. */
export const matchFilePattern = (
  filePath: string,
  pattern: string,
): boolean => {
  const ext = pattern.startsWith("*.") ? pattern.slice(1) : null;
  if (ext !== null) return filePath.endsWith(ext);
  return filePath.includes(pattern.replace(/\*/g, ""));
};

/** Get tier2 rules that match a specific file path in the current phase. */
export const getTier2RulesForFile = (
  rules: readonly ScopedRule[],
  currentPhase: string,
  filePath: string,
): readonly string[] => {
  return rules
    .filter((r) => {
      // Phase filter
      if (r.phases !== undefined && r.phases.length > 0) {
        if (!r.phases.includes(currentPhase)) return false;
      }
      // Must have file scope
      if (r.appliesTo === undefined || r.appliesTo.length === 0) return false;
      // Match file
      return r.appliesTo.some((pat) => matchFilePattern(filePath, pat));
    })
    .map((r) => r.text);
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
