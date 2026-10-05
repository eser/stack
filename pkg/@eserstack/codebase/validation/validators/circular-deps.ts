// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Circular dependency validator
 *
 * @module
 */

import * as validateCircularDeps from "../../validate-circular-deps.ts";
import type { Validator, ValidatorResult } from "../types.ts";

/**
 * Validator for detecting circular dependencies between packages
 *
 * This validator runs for all stacks (language-agnostic).
 */
export const circularDepsValidator: Validator = {
  name: "validate-circular-deps",
  description: "Detect circular package dependencies",
  requiredStacks: [], // Runs for all stacks

  validate: async (options): Promise<ValidatorResult> => {
    const result = await validateCircularDeps.checkCircularDeps({
      root: options.root,
    });

    return {
      name: "validate-circular-deps",
      passed: !result.hasCycles,
      issues: result.cycles.map((cycle) => ({
        severity: "error",
        message: `Circular dependency: ${cycle.join(" → ")}`,
      })),
      stats: { packagesChecked: result.packagesChecked },
    };
  },
};
