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

import * as cliParseArgs from "@std/cli/parse-args";
import * as fmtColors from "@std/fmt/colors";
import * as results from "@eser/primitives/results";
import * as standardsRuntime from "@eser/standards/runtime";
import * as shellArgs from "@eser/shell/args";
import { current } from "@eser/standards/runtime";
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
  const root = options.root ?? current.process.cwd();

  // Load project config
  const config = await loadProjectConfig(root);
  const projectStack = config?.stack ?? [];
  const skipList = [
    ...(config?.validate?.skip ?? []),
    ...(options.skip ?? []),
  ];
  const onlyList = options.only ?? [];

  // Get all validators
  const validators = getValidators();
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

/**
 * CLI main function for standalone usage.
 */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const args = cliParseArgs.parseArgs(
    (cliArgs ?? standardsRuntime.current.process.args) as string[],
    {
      string: ["root", "only", "skip"],
      boolean: ["fix", "help"],
      alias: { h: "help" },
    },
  );

  if (args["help"]) {
    console.log("Usage: deno run --allow-all ./validation/mod.ts [options]");
    console.log();
    console.log("Options:");
    console.log("  --root <dir>           Root directory (default: cwd)");
    console.log(
      "  --only <validators>    Run only specific validators (comma-separated)",
    );
    console.log(
      "  --skip <validators>    Skip specific validators (comma-separated)",
    );
    console.log("  --fix                  Auto-fix issues where supported");
    console.log("  -h, --help             Show this help message");
    return results.ok(undefined);
  }

  const root = args["root"] as string | undefined;
  const fix = args["fix"] as boolean | undefined;

  // Parse comma-separated validator lists
  const onlyRaw = args["only"] as string | undefined;
  const skipRaw = args["skip"] as string | undefined;
  const only = onlyRaw !== undefined
    ? onlyRaw.split(",").map((s) => s.trim())
    : undefined;
  const skip = skipRaw !== undefined
    ? skipRaw.split(",").map((s) => s.trim())
    : undefined;

  // Load project config to show stack info
  const config = await loadProjectConfig(root ?? ".");
  const stackInfo = config?.stack?.join(", ") ?? "all (no .eser.yml)";

  console.log("Validating codebase...\n");
  console.log(`Stack: ${fmtColors.cyan(stackInfo)}\n`);

  const result = await validate({ root, only, skip, fix });

  // Print results
  for (const validatorResult of result.results) {
    const status = validatorResult.passed
      ? fmtColors.green("PASS")
      : fmtColors.red("FAIL");

    const stats = Object.entries(validatorResult.stats)
      .map(([key, value]) => `${value} ${key}`)
      .join(", ");

    console.log(
      `  ${validatorResult.name.padEnd(18)} ${status}  (${stats})`,
    );
  }

  // Print skipped validators
  if (result.skipped.length > 0) {
    console.log(fmtColors.dim("\nSkipped (stack not configured):"));
    for (const skipped of result.skipped) {
      console.log(fmtColors.dim(`  - ${skipped.name}: ${skipped.reason}`));
    }
  }

  // Print disabled validators
  if (result.disabled.length > 0) {
    console.log(fmtColors.dim("\nDisabled:"));
    for (const disabled of result.disabled) {
      console.log(fmtColors.dim(`  - ${disabled}`));
    }
  }

  // Print issues grouped by location (file or validator)
  const allIssues = result.results.flatMap((r) =>
    r.issues.map((i) => ({ validator: r.name, ...i }))
  );

  if (allIssues.length > 0) {
    console.log(fmtColors.red(`\nIssues (${allIssues.length}):\n`));

    // Group issues by location (file path or validator name)
    const grouped = new Map<string, typeof allIssues>();
    for (const issue of allIssues) {
      const location = issue.file ?? issue.validator;
      const existing = grouped.get(location) ?? [];
      existing.push(issue);
      grouped.set(location, existing);
    }

    for (const [location, issues] of grouped) {
      console.log(`  ${fmtColors.dim(location)}`);
      for (const issue of issues) {
        const severity = issue.severity === "error"
          ? fmtColors.red("error")
          : fmtColors.yellow("warning");
        const lineInfo = issue.line !== undefined ? `:${issue.line}` : "";
        console.log(`    ${severity}${lineInfo}: ${issue.message}`);
      }
      console.log();
    }
  }

  // Summary
  const failedCount = result.results.filter((r) => !r.passed).length;
  if (failedCount > 0) {
    return results.fail({
      message: fmtColors.red(
        `\n${failedCount} check(s) failed with ${allIssues.length} issue(s)`,
      ),
      exitCode: 1,
    });
  }

  console.log(fmtColors.green("\nAll checks passed!"));
  return results.ok(undefined);
};

if (import.meta.main) {
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        console.error(error.message);
      }
      standardsRuntime.current.process.setExitCode(error.exitCode);
    },
  });
}
