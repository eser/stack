// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Sync engine — regenerates tool-specific instruction files from .eser/rules/.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as claude from "./claude.ts";
import * as cursor from "./cursor.ts";
import * as kiro from "./kiro.ts";
import * as copilot from "./copilot.ts";
import * as windsurf from "./windsurf.ts";
import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// Rule Loading
// =============================================================================

export const loadRules = async (root: string): Promise<readonly string[]> => {
  const rulesDir = `${root}/${persistence.paths.rulesDir}`;
  const rules: string[] = [];

  try {
    for await (const entry of runtime.fs.readDir(rulesDir)) {
      if (
        entry.isFile &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))
      ) {
        const content = await runtime.fs.readTextFile(
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
// Sync
// =============================================================================

const GENERATORS: Readonly<
  Record<
    schema.CodingToolId,
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
  tools: readonly schema.CodingToolId[],
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
