// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Module reachability validator
 *
 * @module
 */

import * as validateModExports from "../../validate-mod-exports.ts";
import type { Validator, ValidatorResult } from "../types.ts";

/**
 * Validator that reports the modules no package entry point reaches
 *
 * This validator requires the 'javascript' stack.
 */
export const modExportsValidator: Validator = {
  name: "validate-mod-exports",
  description: "Detect modules no package entry point reaches",
  requiredStacks: ["javascript"],

  validate: async (options): Promise<ValidatorResult> => {
    const result = await validateModExports.checkModExports({
      root: options.root,
    });

    return {
      name: "validate-mod-exports",
      passed: result.isComplete,
      issues: result.missingExports.map((missing) => ({
        severity: "error",
        message: `${missing.packageName}: ${missing.file} is not reached from mod.ts, the exports or another entry point; export it or remove it`,
        file: missing.file,
      })),
      stats: { packagesChecked: result.packagesChecked },
    };
  },
};
