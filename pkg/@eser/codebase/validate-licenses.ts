// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * License header validation tool.
 *
 * Validates that all TypeScript files have the correct copyright header.
 * Can be used as a library or as a standalone script.
 *
 * Library usage:
 * ```typescript
 * import * as licenses from "@eser/codebase/validate-licenses";
 *
 * // Check licenses
 * const result = await licenses.validateLicenses();
 * if (!result.valid) {
 *   console.log("Missing headers:", result.missing);
 * }
 *
 * // Fix licenses
 * const fixResult = await licenses.validateLicenses({ fix: true });
 * console.log("Fixed:", fixResult.fixed);
 * ```
 *
 * CLI usage:
 *   deno run --allow-all ./validate-licenses.ts        # Check licenses
 *   deno run --allow-all ./validate-licenses.ts --fix  # Auto-fix missing/incorrect headers
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as primitives from "@eser/primitives";
import * as standards from "@eser/standards";
import * as functions from "@eser/functions";
import * as shell from "@eser/shell";
import { runCliMain, toCliEvent } from "./cli-support.ts";

const output = shell.formatting.createOutput();

/**
 * Options for license validation.
 */
export type ValidateLicensesOptions = {
  /** Root directory to scan (default: parent of codebase package) */
  readonly root?: string;
  /** Auto-fix missing or incorrect headers */
  readonly fix?: boolean;
};

/**
 * Information about a file with license issues.
 */
export type LicenseIssue = {
  /** File path */
  readonly path: string;
  /** Type of issue */
  readonly issue: "missing" | "incorrect";
  /** Whether the issue was fixed */
  readonly fixed: boolean;
};

/**
 * Result of license validation.
 */
export type ValidateLicensesResult = {
  /** Whether all files are valid */
  readonly valid: boolean;
  /** Files that were checked */
  readonly checked: number;
  /** Files with issues */
  readonly issues: LicenseIssue[];
  /** Number of files fixed (when fix: true) */
  readonly fixedCount: number;
};

const EXCLUDES = [
  /docs\/*$/,
  /dist\/*$/,
  /etc\/coverage\/*$/,
  /etc\/temp\/*$/,
  /etc\/templates\/*$/,
  /node_modules\/*$/,
  /etc\/templates\/cf-workers-app\/node_modules\/*$/,
  /etc\/templates\/cf-workers-app\/worker-configuration\.d\.ts$/,
  /manifest\.gen\.ts$/,
];

const BASE_YEAR = "2023";
const RX_COPYRIGHT = new RegExp(
  `// Copyright ([0-9]{4})-present Eser Ozvataf and other contributors\\. All rights reserved\\. ([0-9A-Za-z-.]+) license\\.\n`,
);
const COPYRIGHT =
  `// Copyright ${BASE_YEAR}-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.`;

/**
 * Validates license headers in all TypeScript files.
 *
 * @param options - Validation options
 * @returns Validation result
 */
export const validateLicenses = async (
  options: ValidateLicensesOptions = {},
): Promise<ValidateLicensesResult> => {
  const { fix = false } = options;

  const { root = "." } = options;

  const issues: LicenseIssue[] = [];
  let checked = 0;
  let fixedCount = 0;

  for await (
    const entry of standards.runtime.current.fs.walk(root, {
      exts: standards.patterns.JS_FILE_EXTENSIONS,
      skip: EXCLUDES,
      includeDirs: false,
    })
  ) {
    checked++;
    const content = await standards.runtime.current.fs.readTextFile(entry.path);
    const hasShebang = content.startsWith("#!");
    const shebangEnd = hasShebang ? content.indexOf("\n") + 1 : 0;
    const contentAfterShebang = content.slice(shebangEnd);
    const copyrightMatch = contentAfterShebang.match(RX_COPYRIGHT);

    if (copyrightMatch !== null) {
      if (copyrightMatch[1] === BASE_YEAR) {
        // Everything is fine
        continue;
      }

      // Incorrect year
      if (!fix) {
        issues.push({ path: entry.path, issue: "incorrect", fixed: false });
        continue;
      }

      // Fix incorrect year — replace in full content to preserve shebang
      const shebangPart = content.slice(0, shebangEnd);
      const restWithoutCopyright = contentAfterShebang.replace(
        copyrightMatch[0],
        "",
      );
      const contentWithCopyright =
        `${shebangPart}${COPYRIGHT}\n${restWithoutCopyright}`;
      await standards.runtime.current.fs.writeTextFile(
        entry.path,
        contentWithCopyright,
      );
      issues.push({ path: entry.path, issue: "incorrect", fixed: true });
      fixedCount++;
      continue;
    }

    // Missing header
    if (!fix) {
      issues.push({ path: entry.path, issue: "missing", fixed: false });
      continue;
    }

    // Add missing header — insert after shebang if present
    const contentWithCopyright = hasShebang
      ? `${content.slice(0, shebangEnd)}${COPYRIGHT}\n${contentAfterShebang}`
      : `${COPYRIGHT}\n${content}`;
    await standards.runtime.current.fs.writeTextFile(
      entry.path,
      contentWithCopyright,
    );
    issues.push({ path: entry.path, issue: "missing", fixed: true });
    fixedCount++;
  }

  return {
    valid: issues.length === 0 || issues.every((i) => i.fixed),
    checked,
    issues,
    fixedCount,
  };
};

// --- Handler ---

/** Handler: wraps validateLicenses as a Task via fromPromise. */
export const validateLicensesHandler: functions.handler.Handler<
  ValidateLicensesOptions,
  ValidateLicensesResult,
  Error
> = (input) => functions.task.fromPromise(() => validateLicenses(input));

// --- CLI Adapter ---

/** Adapter: functions.triggers.CliEvent → ValidateLicensesOptions (extracts --fix flag). */
const cliAdapter: functions.handler.Adapter<
  functions.triggers.CliEvent,
  ValidateLicensesOptions
> = (
  event,
) => primitives.results.ok({ fix: event.flags["fix"] === true });

// --- CLI ResponseMapper ---

/** ResponseMapper: formats ValidateLicensesResult for CLI output. */
const cliResponseMapper: functions.handler.ResponseMapper<
  ValidateLicensesResult,
  Error | functions.handler.AdaptError,
  shell.args.CliResult<void>
> = (result) => {
  if (primitives.results.isFail(result)) {
    output.printError(
      result.error instanceof Error
        ? result.error.message
        : String(result.error),
    );
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;

  if (value.issues.length === 0) {
    output.printSuccess(
      `Checked ${value.checked} files. All licenses are valid.`,
    );
    return primitives.results.ok(undefined);
  }

  if (value.issues.some((i) => i.fixed)) {
    for (const issue of value.issues) {
      if (issue.fixed) {
        output.printInfo(`Fixed ${issue.issue} header: ${issue.path}`);
      }
    }
    output.printSuccess(`Fixed ${value.fixedCount} files.`);
    return primitives.results.ok(undefined);
  }

  for (const issue of value.issues) {
    output.printError(
      `${
        issue.issue === "missing" ? "Missing" : "Incorrect"
      } copyright header: ${issue.path}`,
    );
  }
  output.printInfo(`Copyright header should be "${COPYRIGHT}"`);
  return primitives.results.fail({ exitCode: 1 });
};

// --- CLI Trigger ---

/** Runnable CLI trigger for check-licenses. */
export const handleCli: (
  event: functions.triggers.CliEvent,
) => Promise<shell.args.CliResult<void>> = functions.handler.createTrigger({
  handler: validateLicensesHandler,
  adaptInput: cliAdapter,
  adaptOutput: cliResponseMapper,
});

/** CLI entry point for dispatcher compatibility. */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shell.args.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(
    (cliArgs ?? []) as string[],
    { boolean: ["fix"] },
  );
  const event = toCliEvent("validate-licenses", parsed);
  return await handleCli(event);
};

if (import.meta.main) {
  runCliMain(await main(standards.runtime.current.process.args as string[]));
}
