// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Validation system for codebase checks
 *
 * Provides a unified `validate()` function that runs all applicable validators
 * based on the project's stack configuration in `.eser.yml`.
 *
 * @example
 * ```typescript
 * import { validate } from "@eser/codebase/validation";
 *
 * // Run all validators (defaults to all when no .eser.yml)
 * const result = await validate();
 *
 * if (!result.passed) {
 *   console.log("Validation failed:", result.results);
 * }
 *
 * // Check skipped validators
 * for (const skipped of result.skipped) {
 *   console.log(`Skipped ${skipped.name}: ${skipped.reason}`);
 * }
 * ```
 *
 * @module
 */

import { runtime } from "@eser/standards/runtime";
import { loadProjectConfig } from "./config.ts";
import { getValidators } from "./registry.ts";
import type {
  SkippedValidator,
  ValidateOptions,
  ValidateResult,
  ValidatorResult,
} from "./types.ts";

// Re-export types
export type {
  ProjectConfig,
  SkippedValidator,
  StackId,
  ValidateOptions,
  ValidateResult,
  ValidationConfig,
  Validator,
  ValidatorIssue,
  ValidatorOptions,
  ValidatorResult,
} from "./types.ts";

// Re-export config functions
export { getProjectConfigPath, loadProjectConfig } from "./config.ts";

// Re-export registry functions
export {
  getValidator,
  getValidatorNames,
  getValidators,
  registerValidator,
} from "./registry.ts";

/**
 * Run all applicable validators
 *
 * Loads project configuration from `.eser.yml`, determines which validators
 * to run based on the stack configuration, and returns aggregated results.
 *
 * When no `.eser.yml` exists, all validators are run by default.
 *
 * @param options - Validation options
 * @returns Validation result with all validator outputs
 */
export const validate = async (
  options: ValidateOptions = {},
): Promise<ValidateResult> => {
  const root = options.root ?? runtime.process.cwd();

  // Load project config
  const config = await loadProjectConfig(root);
  const projectStack = config?.stack ?? [];
  const skipList = [
    ...(config?.validate?.skip ?? []),
    ...(options.skip ?? []),
  ];
  const onlyList = options.only ?? [];

  // Get all validators
  const validators = await getValidators();
  const results: ValidatorResult[] = [];
  const skipped: SkippedValidator[] = [];
  const disabled: string[] = [];

  for (const validator of validators) {
    // Check if only specific validators should run
    if (onlyList.length > 0 && !onlyList.includes(validator.name)) {
      continue;
    }

    // Check if explicitly skipped
    if (skipList.includes(validator.name)) {
      disabled.push(validator.name);
      continue;
    }

    // Check if required stack is present
    // When projectStack is empty (no .eser.yml), run all validators
    if (validator.requiredStacks.length > 0 && projectStack.length > 0) {
      const hasStack = validator.requiredStacks.some((s) =>
        projectStack.includes(s)
      );
      if (!hasStack) {
        skipped.push({
          name: validator.name,
          reason: `Requires '${validator.requiredStacks.join("' or '")}' stack`,
        });
        continue;
      }
    }

    // Run validator
    const validatorOptions = config?.validate?.options?.[validator.name] ?? {};
    const mergedOptions = {
      ...validatorOptions,
      ...(options.fix !== undefined ? { fix: options.fix } : {}),
    };

    const result = await validator.validate({
      root,
      options: mergedOptions,
    });
    results.push(result);
  }

  return {
    passed: results.every((r) => r.passed),
    results,
    skipped,
    disabled,
  };
};
