// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Server LOC ceiling validator
 *
 * @module
 */

import { checkServerLoc } from "../../validate-server-loc.ts";
import type { Validator, ValidatorResult } from "../types.ts";

export const serverLocValidator: Validator = {
  name: "validate-server-loc",
  description: "Fail if any non-test file in a directory exceeds the line ceiling",
  requiredStacks: ["golang"],

  async validate(options): Promise<ValidatorResult> {
    const directory = options.options?.["directory"] as string | undefined;

    if (directory === undefined || directory === "") {
      return {
        name: "validate-server-loc",
        passed: false,
        issues: [{
          severity: "error" as const,
          message: "validate-server-loc requires a `directory` parameter",
        }],
        stats: { checked: 0, violations: 0 },
      };
    }

    const maxLines = options.options?.["maxLines"] as number | undefined;
    const excludeSuffix = options.options?.["excludeSuffix"] as
      | string
      | undefined;
    const extension = options.options?.["extension"] as string | undefined;

    const result = await checkServerLoc({
      root: options.root,
      directory,
      maxLines,
      excludeSuffix,
      extension,
    });

    return {
      name: "validate-server-loc",
      passed: result.passed,
      issues: result.violations.map((v) => ({
        severity: "error" as const,
        file: v.path,
        message: `${v.lines} lines (limit ${maxLines ?? 500})`,
      })),
      stats: { checked: result.checked, violations: result.violations.length },
    };
  },
};
