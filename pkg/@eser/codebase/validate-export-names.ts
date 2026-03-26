// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Export naming convention checker.
 *
 * Validates that export paths in deno.json follow kebab-case convention.
 *
 * Library usage:
 * ```typescript
 * import * as exportNames from "@eser/codebase/validate-export-names";
 *
 * const result = await exportNames.checkExportNames();
 * if (!result.isValid) {
 *   console.log("Violations:", result.violations);
 * }
 * ```
 *
 * CLI usage:
 *   deno run --allow-all ./validate-export-names.ts
 *
 * @module
 */

import * as primitives from "@eser/primitives";
import * as functions from "@eser/functions";
import * as standards from "@eser/standards";
import type * as shellArgs from "@eser/shell/args";
import * as span from "@eser/streams/span";
import * as workspaceDiscovery from "./workspace-discovery.ts";
import { createCliOutput, runCliMain } from "./cli-support.ts";

const out = createCliOutput();

/**
 * Options for export name checking.
 */
export type CheckExportNamesOptions = {
  /** Root directory (default: ".") */
  readonly root?: string;
  /** Words to ignore in kebab-case validation */
  readonly ignoreWords?: string[];
};

/**
 * Information about a naming violation.
 */
export type ExportNameViolation = {
  /** Package name */
  readonly packageName: string;
  /** Export path that violates convention */
  readonly exportPath: string;
  /** Suggested fix */
  readonly suggestion: string;
};

/**
 * Result of export name check.
 */
export type CheckExportNamesResult = {
  /** Whether all export names are valid */
  readonly isValid: boolean;
  /** Naming violations */
  readonly violations: ExportNameViolation[];
  /** Number of packages checked */
  readonly packagesChecked: number;
};

/**
 * Converts a string to kebab-case.
 *
 * @param str - String to convert
 * @returns Kebab-case string
 */
const toKebabCase = (str: string): string => {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
};

/**
 * Checks if a string is in kebab-case.
 *
 * @param str - String to check
 * @param ignoreWords - Words to ignore
 * @returns Whether the string is kebab-case
 */
const isKebabCase = (str: string, ignoreWords: string[] = []): boolean => {
  // Check each path segment
  const segments = str.split("/").filter((s) => s.length > 0);

  for (const segment of segments) {
    // Skip the leading dot for relative paths
    let cleanSegment = segment.startsWith(".") ? segment.slice(1) : segment;

    if (cleanSegment.length === 0) {
      continue;
    }

    // Strip file extension using path helpers (language-agnostic)
    const ext = standards.runtime.current.path.extname(cleanSegment);
    if (ext.length > 0) {
      cleanSegment = cleanSegment.slice(0, -ext.length);
    }

    if (cleanSegment.length === 0) {
      continue;
    }

    // Check if it's an ignored word
    if (ignoreWords.includes(cleanSegment)) {
      continue;
    }

    // Check for kebab-case pattern: lowercase letters, numbers, and hyphens
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cleanSegment)) {
      return false;
    }
  }

  return true;
};

/**
 * Checks export naming conventions for all workspace packages.
 *
 * @param options - Check options
 * @returns Check result
 */
export const checkExportNames = async (
  options: CheckExportNamesOptions = {},
): Promise<CheckExportNamesResult> => {
  const { root = ".", ignoreWords = [] } = options;

  const packages = await workspaceDiscovery.discoverPackages(root);
  const violations: ExportNameViolation[] = [];

  for (const pkg of packages) {
    const exports = pkg.config.exports?.value;

    if (exports === null || exports === undefined) {
      continue;
    }

    if (typeof exports === "string") {
      // Single export, check the path
      if (!isKebabCase(exports, ignoreWords)) {
        violations.push({
          packageName: pkg.name,
          exportPath: exports,
          suggestion: toKebabCase(exports),
        });
      }
      continue;
    }

    if (exports !== null && typeof exports === "object") {
      for (const [key, value] of Object.entries(exports)) {
        // Check the export key (e.g., "./myModule")
        if (!isKebabCase(key, ignoreWords)) {
          violations.push({
            packageName: pkg.name,
            exportPath: key,
            suggestion: toKebabCase(key),
          });
        }

        // Check the export value (file path)
        if (typeof value === "string" && !isKebabCase(value, ignoreWords)) {
          violations.push({
            packageName: pkg.name,
            exportPath: value,
            suggestion: toKebabCase(value),
          });
        }
      }
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
    packagesChecked: packages.length,
  };
};

// --- Handler ---

/**
 * Handler wrapping checkExportNames as a Task.
 */
export const checkExportNamesHandler: functions.handler.Handler<
  CheckExportNamesOptions,
  CheckExportNamesResult,
  Error
> = (input) => functions.task.fromPromise(() => checkExportNames(input));

// --- CLI Adapter ---

/**
 * Adapter that produces default CheckExportNamesOptions from a CLI event.
 */
const cliAdapter: functions.handler.Adapter<
  functions.triggers.CliEvent,
  CheckExportNamesOptions
> = (
  _event,
) => primitives.results.ok({ root: "." });

// --- CLI ResponseMapper ---

/**
 * Maps the handler result to CLI output.
 */
const cliResponseMapper: functions.handler.ResponseMapper<
  CheckExportNamesResult,
  Error | functions.handler.AdaptError,
  shellArgs.CliResult<void>
> = (result) => {
  if (primitives.results.isFail(result)) {
    out.writeln(span.red("✗"), span.text(" " + String(result.error)));
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;

  out.writeln(
    span.blue("ℹ"),
    span.text(` Checked ${value.packagesChecked} packages.`),
  );

  if (!value.isValid) {
    out.writeln(
      span.red("✗"),
      span.text(
        ` Found ${value.violations.length} naming violations:`,
      ),
    );
    for (const violation of value.violations) {
      out.writeln(span.yellow("⚠"), span.text(" " + violation.packageName));
      out.writeln(
        span.blue("ℹ"),
        span.text(`   Export: ${violation.exportPath}`),
      );
      out.writeln(
        span.blue("ℹ"),
        span.text(`   Suggestion: ${violation.suggestion}`),
      );
    }
    return primitives.results.fail({ exitCode: 1 });
  }

  out.writeln(
    span.green("✓"),
    span.text(" All export names follow conventions."),
  );
  return primitives.results.ok(undefined);
};

// --- CLI Trigger ---

/**
 * CLI trigger for check-export-names.
 */
export const handleCli: (
  event: functions.triggers.CliEvent,
) => Promise<shellArgs.CliResult<void>> = functions.handler.createTrigger({
  handler: checkExportNamesHandler,
  adaptInput: cliAdapter,
  adaptOutput: cliResponseMapper,
});

/** CLI entry point for dispatcher compatibility. */
export const main = async (
  _cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> =>
  await handleCli({ command: "validate-export-names", args: [], flags: {} });

if (import.meta.main) {
  runCliMain(await main(), out);
}
