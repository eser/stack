// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Detect available AI providers and coding tools.
 *
 * AI providers = LLM backends (anthropic, openai, etc.) from @eser/ai.
 * Coding tools = IDE/agent environments (claude-code, cursor, kiro, etc.)
 *   detected by the presence of their config files in the repo.
 *
 * @module
 */

import * as ai from "@eser/ai/mod";
import type * as schema from "../state/schema.ts";
import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// AI Provider Detection (delegates to @eser/ai)
// =============================================================================

export type { ProviderStatus } from "@eser/ai/mod";

export const detectProviders = ai.detectAllProviders;

export const getAvailableProviderNames = ai.getAvailableProviderNames;

// =============================================================================
// Coding Tool Detection (checks for config files in repo)
// =============================================================================

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

const TOOL_SIGNALS: readonly {
  readonly id: schema.CodingToolId;
  readonly paths: readonly string[];
}[] = [
  { id: "claude-code", paths: ["CLAUDE.md", ".claude"] },
  { id: "cursor", paths: [".cursorrules", ".cursor"] },
  { id: "kiro", paths: [".kiro"] },
  { id: "copilot", paths: [".github/copilot-instructions.md"] },
  { id: "windsurf", paths: [".windsurfrules"] },
  { id: "codex", paths: [".codex", ".codex/config.toml"] },
  { id: "copilot-cli", paths: [".copilot", ".github/hooks"] },
];

export const detectCodingTools = async (
  root: string,
): Promise<readonly schema.CodingToolId[]> => {
  const detected: schema.CodingToolId[] = [];

  for (const signal of TOOL_SIGNALS) {
    for (const p of signal.paths) {
      if (await pathExists(`${root}/${p}`)) {
        detected.push(signal.id);
        break;
      }
    }
  }

  return detected;
};
