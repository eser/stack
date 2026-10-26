// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cursor sync: generates .cursorrules.
 *
 * @module
 */

import * as ruleFile from "./rule-file.ts";

/** Where Cursor reads its rules, relative to the project root. */
export const RULE_FILE_PATH = ".cursorrules";

/** Writes the noskills rule file for Cursor. */
export const sync = async (
  root: string,
  rules: readonly string[],
  commandPrefix: string,
): Promise<void> => {
  await ruleFile.writeRuleFile(root, RULE_FILE_PATH, rules, commandPrefix);
};
