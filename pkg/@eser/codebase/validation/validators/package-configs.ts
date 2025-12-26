// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Package configuration consistency validator
 *
 * @module
 */

import { checkPackageConfigs } from "../../check-package-configs.ts";
import type { Validator, ValidatorIssue, ValidatorResult } from "../types.ts";

/**
 * Validator for checking package.json and deno.json consistency
 *
 * This validator requires the 'javascript' stack (npm + Deno).
 */
export const packageConfigsValidator: Validator = {
  name: "package-configs",
  description: "Validate deno.json/package.json consistency",
  requiredStacks: ["javascript"],

  async validate(options): Promise<ValidatorResult> {
    const result = await checkPackageConfigs({ root: options.root });

    const issues: ValidatorIssue[] = [];

    // Add config inconsistencies
    for (const inconsistency of result.inconsistencies) {
      issues.push({
        severity: "error",
        message:
          `${inconsistency.packageName}: ${inconsistency.field} mismatch - deno.json: ${
            JSON.stringify(inconsistency.denoValue)
          }, package.json: ${JSON.stringify(inconsistency.packageValue)}`,
      });
    }

    // Add dependency inconsistencies
    for (const dep of result.dependencyInconsistencies) {
      let message = `${dep.packageName}: ${dep.dependencyName} - ${dep.issue}`;
      if (dep.expected !== undefined && dep.actual !== undefined) {
        message += ` (expected: ${dep.expected}, actual: ${dep.actual})`;
      }
      issues.push({
        severity: "error",
        message,
      });
    }

    return {
      name: "package-configs",
      passed: result.isConsistent,
      issues,
      stats: { packagesChecked: result.packagesChecked },
    };
  },
};
