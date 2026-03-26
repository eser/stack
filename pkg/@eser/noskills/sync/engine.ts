// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Sync engine — regenerates tool-specific instruction files from .nos/rules/.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import * as claude from "./claude.ts";
import * as cursor from "./cursor.ts";
import * as kiro from "./kiro.ts";
import * as copilot from "./copilot.ts";
import * as windsurf from "./windsurf.ts";

// =============================================================================
// Rule Loading
// =============================================================================

export const loadRules = async (root: string): Promise<readonly string[]> => {
  const rulesDir = `${root}/.nos/rules`;
  const rules: string[] = [];

  try {
    for await (const entry of Deno.readDir(rulesDir)) {
      if (
        entry.isFile &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))
      ) {
        const content = await Deno.readTextFile(`${rulesDir}/${entry.name}`);
        rules.push(content.trim());
      }
    }
  } catch {
    // No rules yet
  }

  return rules;
};

// =============================================================================
// Sync
// =============================================================================

const GENERATORS: Readonly<
  Record<
    schema.ToolId,
    (root: string, rules: readonly string[]) => Promise<void>
  >
> = {
  "claude-code": claude.sync,
  cursor: cursor.sync,
  kiro: kiro.sync,
  copilot: copilot.sync,
  windsurf: windsurf.sync,
};

export const syncAll = async (
  root: string,
  tools: readonly schema.ToolId[],
): Promise<readonly string[]> => {
  const rules = await loadRules(root);
  const synced: string[] = [];

  for (const toolId of tools) {
    const generator = GENERATORS[toolId];

    if (generator !== undefined) {
      await generator(root, rules);
      synced.push(toolId);
    }
  }

  return synced;
};
