// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * License header validator
 *
 * @module
 */

import { validateLicenses } from "../../check-licenses.ts";
import type { Validator, ValidatorResult } from "../types.ts";

/**
 * Validator for checking license headers
 *
 * This validator requires the 'javascript' stack (JS/TS specific).
 */
export const licensesValidator: Validator = {
  name: "licenses",
  description: "Validate license headers",
  requiredStacks: ["javascript"],

  async validate(options): Promise<ValidatorResult> {
    const fix = options.options?.["fix"] as boolean | undefined;
    const result = await validateLicenses({
      root: options.root,
      fix,
    });

    return {
      name: "licenses",
      passed: result.valid,
      issues: result.issues.map((issue) => ({
        severity: "error",
        message: `${issue.issue} license header${
          issue.fixed ? " (fixed)" : ""
        }`,
        file: issue.path,
      })),
      stats: {
        filesChecked: result.checked,
        fixedCount: result.fixedCount,
      },
    };
  },
};
