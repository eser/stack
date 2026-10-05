// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * GitHub Copilot sync: generates .github/copilot-instructions.md.
 *
 * @module
 */

import * as ruleFile from "./rule-file.ts";

/** Where GitHub Copilot reads its rules, relative to the project root. */
export const RULE_FILE_PATH = ".github/copilot-instructions.md";

/** Writes the noskills rule file for GitHub Copilot. */
export const sync = async (
  root: string,
  rules: readonly string[],
  commandPrefix: string,
): Promise<void> => {
  await ruleFile.writeRuleFile(root, RULE_FILE_PATH, rules, commandPrefix);
};
