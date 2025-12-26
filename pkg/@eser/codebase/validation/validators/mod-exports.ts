// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Module exports completeness validator
 *
 * @module
 */

import { checkModExports } from "../../check-mod-exports.ts";
import type { Validator, ValidatorResult } from "../types.ts";

/**
 * Validator for checking mod.ts export completeness
 *
 * This validator requires the 'javascript' stack (TypeScript/Deno specific).
 */
export const modExportsValidator: Validator = {
  name: "mod-exports",
  description: "Validate mod.ts exports all files",
  requiredStacks: ["javascript"],

  async validate(options): Promise<ValidatorResult> {
    const result = await checkModExports({ root: options.root });

    return {
      name: "mod-exports",
      passed: result.isComplete,
      issues: result.missingExports.map((missing) => ({
        severity: "error",
        message: `Missing export in ${missing.packageName}: ${missing.file}`,
        file: missing.file,
      })),
      stats: { packagesChecked: result.packagesChecked },
    };
  },
};
