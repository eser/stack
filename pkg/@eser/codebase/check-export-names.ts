// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Export naming convention checker.
 *
 * Validates that export paths in deno.json follow kebab-case convention.
 *
 * Library usage:
 * ```typescript
 * import * as exportNames from "@eser/codebase/check-export-names";
 *
 * const result = await exportNames.checkExportNames();
 * if (!result.isValid) {
 *   console.log("Violations:", result.violations);
 * }
 * ```
 *
 * CLI usage:
 *   deno -A check-export-names.ts
 *
 * @module
 */

import * as fmtColors from "@std/fmt/colors";
import * as pathPosix from "@std/path/posix";
import * as standardsRuntime from "@eser/standards/runtime";
import * as workspaceDiscovery from "./workspace-discovery.ts";

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
    const ext = pathPosix.extname(cleanSegment);
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

    if (typeof exports === "object") {
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

/**
 * CLI main function for standalone usage.
 */
const main = async (): Promise<void> => {
  console.log("Checking export naming conventions...\n");

  const result = await checkExportNames();

  console.log(`Checked ${result.packagesChecked} packages.`);

  if (!result.isValid) {
    console.log(
      fmtColors.red(`\nFound ${result.violations.length} naming violations:\n`),
    );
    for (const violation of result.violations) {
      console.log(fmtColors.yellow(`  ${violation.packageName}:`));
      console.log(`    Export: ${violation.exportPath}`);
      console.log(`    Suggestion: ${violation.suggestion}`);
    }
    standardsRuntime.runtime.process.exit(1);
  } else {
    console.log(fmtColors.green("\nAll export names follow conventions."));
  }
};

if (import.meta.main) {
  await main();
}
