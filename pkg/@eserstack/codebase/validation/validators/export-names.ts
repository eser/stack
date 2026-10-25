// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Export naming convention validator
 *
 * @module
 */

import * as validateExportNames from "../../validate-export-names.ts";
import type { Validator, ValidatorResult } from "../types.ts";

/**
 * Validator for checking export naming conventions
 *
 * This validator requires the 'javascript' stack (Deno specific).
 */
export const exportNamesValidator: Validator = {
  name: "validate-export-names",
  description: "Validate export naming conventions",
  requiredStacks: ["javascript"],

  validate: async (options): Promise<ValidatorResult> => {
    const result = await validateExportNames.checkExportNames({
      root: options.root,
    });

    return {
      name: "validate-export-names",
      passed: result.isValid,
      issues: result.violations.map((violation) => ({
        severity: "error",
        message: `${violation.packageName}: "${violation.exportPath}" should be "${violation.suggestion}"`,
      })),
      stats: { packagesChecked: result.packagesChecked },
    };
  },
};
