// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Documentation validator
 *
 * @module
 */

import { checkDocs } from "../../check-docs.ts";
import type { Validator, ValidatorResult } from "../types.ts";

/**
 * Validator for checking JSDoc documentation
 *
 * This validator requires the 'javascript' stack (TypeScript specific).
 */
export const docsValidator: Validator = {
  name: "docs",
  description: "Validate JSDoc documentation",
  requiredStacks: ["javascript"],

  async validate(options): Promise<ValidatorResult> {
    const requireExamples = options.options?.["requireExamples"] as
      | boolean
      | undefined;
    const result = await checkDocs({
      root: options.root,
      requireExamples,
    });

    return {
      name: "docs",
      passed: result.isValid,
      issues: result.issues.map((issue) => ({
        severity: "error",
        message: `${issue.symbol}: ${issue.issue}`,
        file: issue.file,
        line: issue.line,
      })),
      stats: {
        filesChecked: result.filesChecked,
        symbolsChecked: result.symbolsChecked,
      },
    };
  },
};
