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
import { groupBy } from "@eser/fp/group-by";
import * as standardsRuntime from "@eser/standards/runtime";
import * as pkg from "./package/mod.ts";
import { ConfigFileTypes } from "./package/types.ts";

/**
 * Fields to check for consistency.
 */
export type ConsistencyField = "name" | "version" | "exports";

/**
 * Represents a dependency inconsistency between files.
 */
export type DependencyInconsistency = {
  /** Package name */
  readonly packageName: string;
  /** Dependency name */
  readonly dependencyName: string;
  /** Issue type */
  readonly issue: "missing_in_deno" | "missing_in_package" | "version_mismatch";
  /** Expected value */
  readonly expected?: string;
  /** Actual value */
  readonly actual?: string;
};

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
  /** Found dependency inconsistencies */
  readonly dependencyInconsistencies: ReadonlyArray<DependencyInconsistency>;
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
 * Checks if a specifier is in npm JSR format (npm:@jsr/scope__name).
 */
const isNpmJsrSpec = (spec: string): boolean => {
  return spec.startsWith("npm:@jsr/");
};

/**
 * Converts npm JSR format to deno JSR format.
 * npm:@jsr/scope__name@version -> jsr:@scope/name@version
 */
const fromNpmJsrToDeno = (spec: string): string => {
  // Remove 'npm:@jsr/' prefix
  const remaining = spec.slice(9); // "npm:@jsr/".length = 9

  // Find the double underscore separator
  const underscoreIndex = remaining.indexOf("__");
  if (underscoreIndex === -1) {
    throw new Error(`Invalid npm JSR format: ${spec}`);
  }

  const scope = remaining.slice(0, underscoreIndex);

  // Find version separator (@ after the package name)
  const afterUnderscore = remaining.slice(underscoreIndex + 2);
  const versionIndex = afterUnderscore.indexOf("@");

  let packageName: string;
  let versionSuffix: string;

  if (versionIndex === -1) {
    packageName = afterUnderscore;
    versionSuffix = "";
  } else {
    packageName = afterUnderscore.slice(0, versionIndex);
    versionSuffix = afterUnderscore.slice(versionIndex);
  }

  return `jsr:@${scope}/${packageName}${versionSuffix}`;
};

/**
 * Converts a package.json dependency to expected deno.json import format.
 */
const convertPkgDepToDenoImport = (depName: string, spec: string): string => {
  if (isNpmJsrSpec(spec)) {
    return fromNpmJsrToDeno(spec);
  }
  // Regular npm package - format as npm:packagename@version
  if (spec.startsWith("npm:")) {
    return spec;
  }
  return `npm:${depName}@${spec}`;
};

/**
 * Checks if a dependency should be treated as a workspace dependency.
 */
const isWorkspaceDep = (spec: string): boolean => {
  return spec === "workspace:*" || spec.startsWith("workspace:");
};

/**
 * Checks dependencies between package.json and deno.json.
 */
const checkDependencies = (
  packageName: string,
  pkgContent: Record<string, unknown>,
  denoContent: Record<string, unknown>,
): DependencyInconsistency[] => {
  const inconsistencies: DependencyInconsistency[] = [];

  // Get dependencies from package.json
  const pkgDeps = (pkgContent["dependencies"] ?? {}) as Record<string, string>;
  const pkgDevDeps = (pkgContent["devDependencies"] ?? {}) as Record<
    string,
    string
  >;
  const allPkgDeps = { ...pkgDeps, ...pkgDevDeps };

  // Get imports from deno.json
  const denoImports = (denoContent["imports"] ?? {}) as Record<string, string>;

  // Check each package.json dependency exists in deno.json imports
  for (const [depName, depSpec] of Object.entries(allPkgDeps)) {
    // Skip workspace dependencies
    if (isWorkspaceDep(depSpec)) {
      continue;
    }

    const expectedDenoSpec = convertPkgDepToDenoImport(depName, depSpec);
    const actualDenoSpec = denoImports[depName];

    if (actualDenoSpec === undefined) {
      inconsistencies.push({
        packageName,
        dependencyName: depName,
        issue: "missing_in_deno",
        expected: expectedDenoSpec,
      });
    } else if (actualDenoSpec !== expectedDenoSpec) {
      inconsistencies.push({
        packageName,
        dependencyName: depName,
        issue: "version_mismatch",
        expected: expectedDenoSpec,
        actual: actualDenoSpec,
      });
    }
  }

  // Check for extra imports in deno.json that aren't in package.json
  for (const [importName, _importSpec] of Object.entries(denoImports)) {
    // Skip if it exists in package.json dependencies
    if (allPkgDeps[importName] !== undefined) {
      continue;
    }

    inconsistencies.push({
      packageName,
      dependencyName: importName,
      issue: "missing_in_package",
      actual: denoImports[importName],
    });
  }

  return inconsistencies;
};

/**
 * Result of checking a single package.
 */
type PackageCheckResult = {
  inconsistencies: ConfigInconsistency[];
  dependencyInconsistencies: DependencyInconsistency[];
};

/**
 * Checks a single package for config inconsistencies.
 */
const checkPackage = async (
  packagePath: string,
  packageName: string,
): Promise<PackageCheckResult> => {
  const inconsistencies: ConfigInconsistency[] = [];
  const dependencyInconsistencies: DependencyInconsistency[] = [];

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
    return { inconsistencies: [], dependencyInconsistencies: [] };
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

  // Check dependencies
  const depIssues = checkDependencies(
    packageName,
    pkgFile.content,
    denoFile.content,
  );
  dependencyInconsistencies.push(...depIssues);

  return { inconsistencies, dependencyInconsistencies };
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
  const allDependencyInconsistencies: DependencyInconsistency[] = [];
  let packagesChecked = 0;

  for (const module of modules) {
    const packagePath = pkg.getBaseDir(module.config);

    try {
      const result = await checkPackage(packagePath, module.name);
      packagesChecked++;

      if (result.inconsistencies.length > 0) {
        allInconsistencies.push(...result.inconsistencies);
      }

      if (result.dependencyInconsistencies.length > 0) {
        allDependencyInconsistencies.push(...result.dependencyInconsistencies);
      }

      if (
        failFast &&
        (result.inconsistencies.length > 0 ||
          result.dependencyInconsistencies.length > 0)
      ) {
        return {
          isConsistent: false,
          inconsistencies: allInconsistencies,
          dependencyInconsistencies: allDependencyInconsistencies,
          packagesChecked,
        };
      }
    } catch {
      // Skip packages that can't be loaded
      continue;
    }
  }

  const hasIssues = allInconsistencies.length > 0 ||
    allDependencyInconsistencies.length > 0;

  return {
    isConsistent: !hasIssues,
    inconsistencies: allInconsistencies,
    dependencyInconsistencies: allDependencyInconsistencies,
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
 * Formats a dependency issue for display.
 */
const formatDepIssue = (inc: DependencyInconsistency): string => {
  switch (inc.issue) {
    case "missing_in_deno":
      return `Missing in deno.json imports. Expected: ${inc.expected}`;
    case "missing_in_package":
      return `Extra in deno.json imports (not in package.json): ${inc.actual}`;
    case "version_mismatch":
      return `Version mismatch. Expected: ${inc.expected}, Actual: ${inc.actual}`;
  }
};

/**
 * CLI main function for standalone usage.
 */
const main = async (): Promise<void> => {
  console.log("Checking package config consistency...\n");

  const result = await checkPackageConfigs();

  console.log(`Checked ${result.packagesChecked} packages.`);

  if (!result.isConsistent) {
    // Show field inconsistencies
    if (result.inconsistencies.length > 0) {
      console.log(
        fmtColors.red(
          `\nFound ${result.inconsistencies.length} field inconsistencies:\n`,
        ),
      );

      // Group by package
      const byPackage = groupBy(
        result.inconsistencies,
        (inc) => inc.packageName,
      );

      for (const [pkgName, inconsistencies] of Object.entries(byPackage)) {
        console.log(fmtColors.yellow(`${pkgName}:`));
        for (const inc of inconsistencies) {
          console.log(fmtColors.red(`  ⚠ ${inc.field} mismatch:`));
          console.log(`    deno.json:    ${formatValue(inc.denoValue)}`);
          console.log(`    package.json: ${formatValue(inc.packageValue)}`);
        }
        console.log();
      }
    }

    // Show dependency inconsistencies
    if (result.dependencyInconsistencies.length > 0) {
      console.log(
        fmtColors.red(
          `\nFound ${result.dependencyInconsistencies.length} dependency inconsistencies:\n`,
        ),
      );

      // Group by package
      const byPackage = groupBy(
        result.dependencyInconsistencies,
        (inc) => inc.packageName,
      );

      for (const [pkgName, inconsistencies] of Object.entries(byPackage)) {
        console.log(fmtColors.yellow(`${pkgName}:`));
        for (const inc of inconsistencies) {
          console.log(fmtColors.red(`  ⚠ ${inc.dependencyName}:`));
          console.log(`    ${formatDepIssue(inc)}`);
        }
        console.log();
      }
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
