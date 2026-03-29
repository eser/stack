// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Validation system for codebase checks
 *
 * Provides a unified `validate()` function that runs all applicable validators
 * based on the project's stack configuration in `.eser/manifest.yml`.
 *
 * @example
 * ```typescript
 * import { validate } from "@eser/codebase/validation";
 *
 * // Run all validators (defaults to all when no .eser/manifest.yml)
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
import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import * as tui from "@eser/shell/tui";
import { runtime } from "@eser/standards/cross-runtime";
import { createCliContext } from "../cli-support.ts";
import { loadProjectConfig } from "./config.ts";
import { getValidators } from "./registry.ts";
import type {
  SkippedValidator,
  ValidateOptions,
  ValidateResult,
  ValidatorResult,
} from "./types.ts";

/** Maximum number of validators to run concurrently in read-only (non-fix) mode. */
const CONCURRENCY_LIMIT = 8;

// Re-export types
export type {
  ProjectConfig,
  SkippedValidator,
  StackId,
  ValidateOptions,
  ValidateResult,
  Validator,
  ValidatorIssue,
  ValidatorOptions,
  ValidatorResult,
} from "./types.ts";

// Re-export config functions
export { getProjectConfigPath, loadProjectConfig } from "./config.ts";

// Re-export registry functions
export type { WorkflowCompatibleTool } from "./registry.ts";
export {
  getValidator,
  getValidatorNames,
  getValidators,
  getWorkflowTools,
  registerValidator,
} from "./registry.ts";

/**
 * Run all applicable validators
 *
 * Loads project configuration from `.eser/manifest.yml`, determines which validators
 * to run based on the stack configuration, and returns aggregated results.
 *
 * When no `.eser/manifest.yml` exists, all validators are run by default.
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
  const skipList = [...(options.skip ?? [])];
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
    // When projectStack is empty (no .eser/manifest.yml), run all validators
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
    const mergedOptions = {
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
 *
 * Displays a spinner while loading config, a progress bar while running
 * validators, and streams per-validator results in real-time using TUI
 * components from `@eser/shell/tui`.
 */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const args = cliParseArgs.parseArgs(
    (cliArgs ?? runtime.process.args) as string[],
    {
      string: ["root", "only", "skip"],
      boolean: ["fix", "help", "json", "yes"],
      alias: { h: "help", y: "yes" },
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
    console.log(
      "  -y, --yes              Auto-confirm all fix prompts (no interactive prompts)",
    );
    console.log(
      "  --json                 Output results as JSON (suppresses TUI output)",
    );
    console.log("  -h, --help             Show this help message");
    return results.ok(undefined);
  }

  const jsonMode = args["json"] as boolean | undefined;
  const autoYes = args["yes"] as boolean | undefined;

  const root = args["root"] as string | undefined;
  const fix = args["fix"] as boolean | undefined;

  // Parse comma-separated validator lists
  const onlyRaw = args["only"] as string | undefined;
  const skipRaw = args["skip"] as string | undefined;
  const onlyList = onlyRaw !== undefined
    ? onlyRaw.split(",").map((s) => s.trim())
    : [];
  const skipList = skipRaw !== undefined
    ? skipRaw.split(",").map((s) => s.trim())
    : [];

  // --- JSON mode: force non-interactive, suppress all TUI output ---
  const { ctx } = jsonMode
    ? {
      ctx: tui.createTuiContext({ interaction: "non-interactive" }),
    }
    : createCliContext();

  const isInteractive = ctx.interaction === "interactive";

  // --- Shared: load config and filter validators ---
  const resolvedRoot = root ?? runtime.process.cwd();

  if (!jsonMode) {
    tui.intro(ctx, "Validating codebase...");
  }

  // --- Load project config with spinner ---
  const spinner = jsonMode
    ? undefined
    : tui.createSpinner(ctx, "Loading config...");
  spinner?.start();

  const config = await loadProjectConfig(resolvedRoot);
  const projectStack = config?.stack ?? [];
  const stackInfo = projectStack.length > 0
    ? projectStack.join(", ")
    : "all (no .eser/manifest.yml)";

  spinner?.succeed("Config loaded");

  if (!jsonMode) {
    tui.log.info(ctx, `Stack: ${stackInfo}`);
  }

  // --- Filter validators (mirrors validate() logic) ---
  const allValidators = getValidators();
  const validatorsToRun: typeof allValidators[number][] = [];
  const skippedValidators: SkippedValidator[] = [];
  const disabledNames: string[] = [];

  for (const validator of allValidators) {
    // Check --only filter
    if (onlyList.length > 0 && !onlyList.includes(validator.name)) {
      continue;
    }

    // Check --skip filter
    if (skipList.includes(validator.name)) {
      disabledNames.push(validator.name);
      continue;
    }

    // Check stack compatibility
    if (validator.requiredStacks.length > 0 && projectStack.length > 0) {
      const hasStack = validator.requiredStacks.some((s) =>
        projectStack.includes(s)
      );
      if (!hasStack) {
        skippedValidators.push({
          name: validator.name,
          reason: `Requires '${validator.requiredStacks.join("' or '")}' stack`,
        });
        continue;
      }
    }

    validatorsToRun.push(validator);
  }

  // --- Run validators with progress bar ---
  const validatorResults: ValidatorResult[] = [];
  const progress = jsonMode ? undefined : tui.createProgress(ctx, {
    total: validatorsToRun.length,
    label: "Validating...",
  });
  progress?.start();

  // Stream a single validator result to the TUI and advance the progress bar.
  const streamResult = (result: ValidatorResult) => {
    validatorResults.push(result);

    if (!jsonMode) {
      const stats = Object.entries(result.stats)
        .map(([key, value]) => `${value} ${key}`)
        .join(", ");
      const label = `${result.name.padEnd(18)} (${stats})`;

      if (result.passed) {
        tui.log.success(ctx, `PASS  ${label}`);
      } else {
        tui.log.error(ctx, `FAIL  ${label}`);
      }
    }

    progress?.advance(1);
  };

  if (fix) {
    // --- Sequential execution (fix mode) ---
    // Fixes may depend on execution order and require interactive confirm prompts,
    // so we must run validators one at a time.
    for (const validator of validatorsToRun) {
      // First pass: always run in check-only mode
      const checkResult = await validator.validate({
        root: resolvedRoot,
        options: {},
      });

      let finalResult = checkResult;

      // If fix is requested and issues were found, handle fix logic
      if (!checkResult.passed) {
        let shouldFix = true;

        // In interactive mode without --yes, prompt for confirmation
        if (isInteractive && !autoYes && !jsonMode) {
          const issueCount = checkResult.issues.length;
          const confirmed = await tui.confirm(ctx, {
            message: `Fix ${issueCount} issue(s) found by ${validator.name}?`,
            initialValue: true,
          });

          if (tui.isCancel(confirmed) || !confirmed) {
            shouldFix = false;
          }
        }

        if (shouldFix) {
          // Re-run with fix enabled
          finalResult = await validator.validate({
            root: resolvedRoot,
            options: { fix: true },
          });
        }
      }

      streamResult(finalResult);
    }
  } else {
    // --- Parallel execution (read-only mode) ---
    // Bounded concurrency: up to CONCURRENCY_LIMIT validators run at once.
    // Results stream in completion order; Promise.allSettled ensures one
    // failure does not abort the rest.
    let index = 0;

    const executeWorker = async (): Promise<void> => {
      while (index < validatorsToRun.length) {
        const currentIndex = index++;
        const validator = validatorsToRun[currentIndex];

        if (validator === undefined) {
          break;
        }

        try {
          const result = await validator.validate({
            root: resolvedRoot,
            options: {},
          });
          streamResult(result);
        } catch (error) {
          // Validator threw — synthesise a failed result so the run continues.
          const failedResult: ValidatorResult = {
            name: validator.name,
            passed: false,
            issues: [{
              severity: "error",
              message: String(error),
            }],
            stats: { filesChecked: 0, issuesFound: 1, fixedCount: 0 },
          };
          streamResult(failedResult);
        }
      }
    };

    const workerCount = Math.min(
      CONCURRENCY_LIMIT,
      validatorsToRun.length,
    );
    const workers = Array.from({ length: workerCount }, () => executeWorker());
    await Promise.allSettled(workers);
  }

  progress?.stop("Validation complete");

  // --- Print skipped validators ---
  if (!jsonMode && skippedValidators.length > 0) {
    tui.log.step(ctx, "Skipped (stack not configured):");
    for (const skippedItem of skippedValidators) {
      tui.log.step(ctx, `  - ${skippedItem.name}: ${skippedItem.reason}`);
    }
  }

  // --- Print disabled validators ---
  if (!jsonMode && disabledNames.length > 0) {
    tui.log.step(ctx, "Disabled:");
    for (const disabledItem of disabledNames) {
      tui.log.step(ctx, `  - ${disabledItem}`);
    }
  }

  // --- Print issues grouped by location ---
  const allIssues = validatorResults.flatMap((r) =>
    r.issues.map((i) => ({ validator: r.name, ...i }))
  );

  if (!jsonMode && allIssues.length > 0) {
    tui.log.warn(ctx, `Issues (${allIssues.length}):`);

    // Group issues by location (file path or validator name)
    const grouped = new Map<string, typeof allIssues>();
    for (const issue of allIssues) {
      const location = issue.file ?? issue.validator;
      const existing = grouped.get(location) ?? [];
      existing.push(issue);
      grouped.set(location, existing);
    }

    for (const [location, issues] of grouped) {
      tui.log.step(ctx, `  ${location}`);
      for (const issue of issues) {
        const severityTag = issue.severity === "error" ? "error" : "warning";
        const lineInfo = issue.line !== undefined ? `:${issue.line}` : "";
        if (issue.severity === "error") {
          tui.log.error(ctx, `    ${severityTag}${lineInfo}: ${issue.message}`);
        } else {
          tui.log.warn(ctx, `    ${severityTag}${lineInfo}: ${issue.message}`);
        }
      }
    }
  }

  // --- Interactive error drill-down ---
  const failedResults = validatorResults.filter((r) => !r.passed);

  if (!jsonMode && isInteractive && failedResults.length > 0) {
    while (true) {
      const selectOptions = [
        ...failedResults.map((r) => ({
          value: r.name,
          label: `${r.name} (${r.issues.length} issue(s))`,
        })),
        { value: "__done__", label: "Done" },
      ];

      const selected = await tui.select<string>(ctx, {
        message: "View details for which validator?",
        options: selectOptions,
      });

      if (tui.isCancel(selected) || selected === "__done__") {
        break;
      }

      // Show detailed issues for the selected validator
      const selectedResult = failedResults.find((r) => r.name === selected);
      if (selectedResult !== undefined) {
        tui.log.info(
          ctx,
          `Details for ${selectedResult.name} (${selectedResult.issues.length} issue(s)):`,
        );
        for (const issue of selectedResult.issues) {
          const severityTag = issue.severity === "error" ? "error" : "warning";
          const fileInfo = issue.file ?? selectedResult.name;
          const lineInfo = issue.line !== undefined ? `:${issue.line}` : "";
          if (issue.severity === "error") {
            tui.log.error(
              ctx,
              `  ${fileInfo}${lineInfo} [${severityTag}]: ${issue.message}`,
            );
          } else {
            tui.log.warn(
              ctx,
              `  ${fileInfo}${lineInfo} [${severityTag}]: ${issue.message}`,
            );
          }
        }
      }
    }
  }

  // --- JSON mode: output structured JSON and exit ---
  if (jsonMode) {
    const passed = validatorResults.every((r) => r.passed);
    const jsonOutput = JSON.stringify(
      {
        passed,
        results: validatorResults,
        skipped: skippedValidators,
        disabled: disabledNames,
      },
      null,
      2,
    );
    console.log(jsonOutput);

    if (!passed) {
      return results.fail({
        message: "",
        exitCode: 1,
      });
    }
    return results.ok(undefined);
  }

  // --- Summary ---
  const failedCount = failedResults.length;
  if (failedCount > 0) {
    tui.outro(
      ctx,
      `${failedCount} check(s) failed with ${allIssues.length} issue(s)`,
    );
    return results.fail({
      message:
        `${failedCount} check(s) failed with ${allIssues.length} issue(s)`,
      exitCode: 1,
    });
  }

  tui.outro(ctx, "All checks passed!");
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
      runtime.process.setExitCode(error.exitCode);
    },
  });
}
