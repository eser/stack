// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Windsurf sync: generates .windsurfrules.
 *
 * @module
 */

import * as ruleFile from "./rule-file.ts";

/** Where Windsurf reads its rules, relative to the project root. */
export const RULE_FILE_PATH = ".windsurfrules";

/** Writes the noskills rule file for Windsurf. */
export const sync = async (
  root: string,
  rules: readonly string[],
  commandPrefix: string,
): Promise<void> => {
  await ruleFile.writeRuleFile(root, RULE_FILE_PATH, rules, commandPrefix);
};
