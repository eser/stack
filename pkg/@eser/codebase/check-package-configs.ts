// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Package configuration consistency checker.
 *
 * Validates that package.json and deno.json files have consistent
 * values for name, version, and exports fields.
 *
 * Library usage:
 * ```typescript
 * import * as configCheck from "@eser/codebase/check-package-configs";
 *
 * const result = await configCheck.checkPackageConfigs();
 * if (!result.isConsistent) {
 *   console.log("Inconsistencies:", result.inconsistencies);
 * }
 * ```
 *
 * CLI usage:
 *   deno -A check-package-configs.ts
 *
 * @module
 */

import * as fmtColors from "@std/fmt/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import * as pkg from "./package/mod.ts";
import { ConfigFileTypes } from "./package/types.ts";

/**
 * Fields to check for consistency.
 */
export type ConsistencyField = "name" | "version" | "exports";

/**
 * Represents a configuration inconsistency between files.
 */
export type ConfigInconsistency = {
  /** Package name */
  readonly packageName: string;
  /** Field with inconsistent values */
  readonly field: ConsistencyField;
  /** Value from deno.json */
  readonly denoValue: unknown;
  /** Value from package.json */
  readonly packageValue: unknown;
};

/**
 * Options for package config checking.
 */
export type CheckPackageConfigsOptions = {
  /** Root directory (default: ".") */
  readonly root?: string;
  /** Stop at first inconsistency */
  readonly failFast?: boolean;
};

/**
 * Result of package config consistency check.
 */
export type CheckPackageConfigsResult = {
  /** Whether all packages have consistent configs */
  readonly isConsistent: boolean;
  /** Found inconsistencies */
  readonly inconsistencies: ReadonlyArray<ConfigInconsistency>;
  /** Number of packages checked */
  readonly packagesChecked: number;
};

/**
 * Compares two values for deep equality.
 */
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (typeof a !== "object" || a === null || b === null) {
    return false;
  }

  // Compare as JSON for objects
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * Gets field value from raw config content.
 */
const getFieldValue = (
  content: Record<string, unknown>,
  field: ConsistencyField,
): unknown => {
  return content[field];
};

/**
 * Checks a single package for config inconsistencies.
 */
const checkPackage = async (
  packagePath: string,
  packageName: string,
): Promise<ConfigInconsistency[]> => {
  const inconsistencies: ConfigInconsistency[] = [];

  // Load config with both file types
  const config = await pkg.load({
    baseDir: packagePath,
    includeFiles: [ConfigFileTypes.DenoJson, ConfigFileTypes.PackageJson],
  });

  // Find both files
  const denoFile = config._loadedFiles.find(
    (f) => f.fileType === ConfigFileTypes.DenoJson,
  );
  const pkgFile = config._loadedFiles.find(
    (f) => f.fileType === ConfigFileTypes.PackageJson,
  );

  // Skip if either file is missing
  if (denoFile === undefined || pkgFile === undefined) {
    return [];
  }

  // Check each field
  const fieldsToCheck: ConsistencyField[] = ["name", "version", "exports"];

  for (const field of fieldsToCheck) {
    const denoValue = getFieldValue(denoFile.content, field);
    const pkgValue = getFieldValue(pkgFile.content, field);

    // Skip if field is missing from either file
    if (denoValue === undefined || pkgValue === undefined) {
      continue;
    }

    // Compare values
    if (!deepEqual(denoValue, pkgValue)) {
      inconsistencies.push({
        packageName,
        field,
        denoValue,
        packageValue: pkgValue,
      });
    }
  }

  return inconsistencies;
};

/**
 * Checks package configuration consistency across all workspace packages.
 *
 * @param options - Check options
 * @returns Check result
 */
export const checkPackageConfigs = async (
  options: CheckPackageConfigsOptions = {},
): Promise<CheckPackageConfigsResult> => {
  const { root = ".", failFast = false } = options;

  const [_rootConfig, modules] = await pkg.getWorkspaceModules(root);
  const allInconsistencies: ConfigInconsistency[] = [];
  let packagesChecked = 0;

  for (const module of modules) {
    const packagePath = pkg.getBaseDir(module.config);

    try {
      const inconsistencies = await checkPackage(packagePath, module.name);
      packagesChecked++;

      if (inconsistencies.length > 0) {
        allInconsistencies.push(...inconsistencies);

        if (failFast) {
          return {
            isConsistent: false,
            inconsistencies: allInconsistencies,
            packagesChecked,
          };
        }
      }
    } catch {
      // Skip packages that can't be loaded
      continue;
    }
  }

  return {
    isConsistent: allInconsistencies.length === 0,
    inconsistencies: allInconsistencies,
    packagesChecked,
  };
};

/**
 * Formats a value for display.
 */
const formatValue = (value: unknown): string => {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  return JSON.stringify(value, null, 2);
};

/**
 * CLI main function for standalone usage.
 */
const main = async (): Promise<void> => {
  console.log("Checking package config consistency...\n");

  const result = await checkPackageConfigs();

  console.log(`Checked ${result.packagesChecked} packages.`);

  if (!result.isConsistent) {
    console.log(
      fmtColors.red(
        `\nFound ${result.inconsistencies.length} inconsistencies:\n`,
      ),
    );

    // Group by package
    const byPackage = new Map<string, ConfigInconsistency[]>();
    for (const inc of result.inconsistencies) {
      const existing = byPackage.get(inc.packageName) ?? [];
      existing.push(inc);
      byPackage.set(inc.packageName, existing);
    }

    for (const [pkgName, inconsistencies] of byPackage) {
      console.log(fmtColors.yellow(`${pkgName}:`));
      for (const inc of inconsistencies) {
        console.log(fmtColors.red(`  ⚠ ${inc.field} mismatch:`));
        console.log(`    deno.json:    ${formatValue(inc.denoValue)}`);
        console.log(`    package.json: ${formatValue(inc.packageValue)}`);
      }
      console.log();
    }

    standardsRuntime.runtime.process.exit(1);
  } else {
    console.log(
      fmtColors.green("\nAll package configs are consistent."),
    );
  }
};

if (import.meta.main) {
  await main();
}
