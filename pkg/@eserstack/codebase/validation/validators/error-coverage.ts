// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Error struct field-coverage validator
 *
 * @module
 */

import { checkErrorCoverage } from "../../validate-error-coverage.ts";
import type { Validator, ValidatorResult } from "../types.ts";

export const errorCoverageValidator: Validator = {
  name: "validate-error-coverage",
  description: "Verify error-struct entries have non-empty required fields",
  requiredStacks: ["golang"],

  async validate(options): Promise<ValidatorResult> {
    const file = options.options?.["file"] as string | undefined;

    if (file === undefined || file === "") {
      return {
        name: "validate-error-coverage",
        passed: false,
        issues: [{
          severity: "error" as const,
          message: "validate-error-coverage requires a `file` parameter",
        }],
        stats: { checked: 0, violations: 0 },
      };
    }

    const errorObjects = options.options?.["errorObjects"] as
      | string[]
      | undefined;
    const requiredFields = options.options?.["requiredFields"] as
      | string[]
      | undefined;

    const result = await checkErrorCoverage({
      root: options.root,
      file,
      errorObjects,
      requiredFields,
    });

    return {
      name: "validate-error-coverage",
      passed: result.passed,
      issues: result.violations.map((v) => ({
        severity: "error" as const,
        file,
        message: `${v.name}: missing [${v.missing.join(", ")}]`,
      })),
      stats: { checked: result.checked, violations: result.violations.length },
    };
  },
};
