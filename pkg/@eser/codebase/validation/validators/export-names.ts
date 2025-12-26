// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Export naming convention validator
 *
 * @module
 */

import { checkExportNames } from "../../check-export-names.ts";
import type { Validator, ValidatorResult } from "../types.ts";

/**
 * Validator for checking export naming conventions
 *
 * This validator requires the 'javascript' stack (Deno specific).
 */
export const exportNamesValidator: Validator = {
  name: "export-names",
  description: "Validate export naming conventions",
  requiredStacks: ["javascript"],

  async validate(options): Promise<ValidatorResult> {
    const result = await checkExportNames({ root: options.root });

    return {
      name: "export-names",
      passed: result.isValid,
      issues: result.violations.map((violation) => ({
        severity: "error",
        message:
          `${violation.packageName}: "${violation.exportPath}" should be "${violation.suggestion}"`,
      })),
      stats: { packagesChecked: result.packagesChecked },
    };
  },
};
