// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Laroux package boundary validator
 *
 * @module
 */

import * as validateLarouxBoundaries from "../../validate-laroux-boundaries.ts";
import type { Validator, ValidatorResult } from "../types.ts";

const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

export const larouxBoundariesValidator: Validator = {
  name: "validate-laroux-boundaries",
  description:
    "Enforce the laroux package boundaries and the allowlist of deprecated-package importers",
  requiredStacks: [],

  validate: async (options): Promise<ValidatorResult> => {
    const allowlist = options.options?.["allowlist"];
    const result = await validateLarouxBoundaries.checkLarouxBoundaries({
      root: options.root,
      allowlist: typeof allowlist === "string" ? allowlist : undefined,
      exclude: stringList(options.options?.["exclude"]),
    });

    return {
      name: "validate-laroux-boundaries",
      passed: result.issues.length === 0,
      issues: result.issues,
      stats: { filesChecked: result.filesChecked },
    };
  },
};
