// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Module exports completeness checker.
 *
 * Validates that mod.ts files export all public TypeScript files in a package.
 * Excludes test files (*_test.ts, *_bench.ts) and private files (_*.ts).
 *
 * Library usage:
 * ```typescript
 * import * as modExports from "@eser/codebase/check-mod-exports";
 *
 * const result = await modExports.checkModExports();
 * if (!result.isComplete) {
 *   console.log("Missing exports:", result.missingExports);
 * }
 * ```
 *
 * CLI usage:
 *   deno -A check-mod-exports.ts
 *
 * @module
 */

import * as pathPosix from "@std/path/posix";
import * as fmtColors from "@std/fmt/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import * as workspaceDiscovery from "./workspace-discovery.ts";

/**
 * Options for mod.ts export checking.
 */
export type CheckModExportsOptions = {
  /** Root directory (default: ".") */
  readonly root?: string;
  /** Stop at first error */
  readonly failFast?: boolean;
};

/**
 * Information about a missing export.
 */
export type MissingExport = {
  /** Package name */
  readonly packageName: string;
  /** File that should be exported */
  readonly file: string;
};

/**
 * Result of mod.ts export check.
 */
export type CheckModExportsResult = {
  /** Whether all packages have complete exports */
  readonly isComplete: boolean;
  /** Missing exports */
  readonly missingExports: MissingExport[];
  /** Number of packages checked */
  readonly packagesChecked: number;
};

/**
 * Extracts exports from mod.ts content.
 *
 * @param content - mod.ts file content
 * @returns Set of exported file paths
 */
const extractExportsFromMod = (content: string): Set<string> => {
  const exports = new Set<string>();

  // Match export * from "./file.ts"
  const reExportAll = /export\s+\*\s+from\s+["']([^"']+)["']/g;
  // Match export { ... } from "./file.ts"
  const reExportNamed = /export\s+\{[^}]*\}\s+from\s+["']([^"']+)["']/g;
  // Match export type { ... } from "./file.ts"
  const reExportType = /export\s+type\s+\{[^}]*\}\s+from\s+["']([^"']+)["']/g;

  for (const match of content.matchAll(reExportAll)) {
    if (match[1] !== undefined) {
      exports.add(match[1]);
    }
  }
  for (const match of content.matchAll(reExportNamed)) {
    if (match[1] !== undefined) {
      exports.add(match[1]);
    }
  }
  for (const match of content.matchAll(reExportType)) {
    if (match[1] !== undefined) {
      exports.add(match[1]);
    }
  }

  return exports;
};

/**
 * Normalizes a file path for comparison.
 *
 * @param filePath - File path to normalize
 * @returns Normalized path
 */
const normalizePath = (filePath: string): string => {
  // Remove leading ./
  let normalized = filePath.startsWith("./") ? filePath.slice(2) : filePath;
  // Remove .ts extension for comparison
  if (normalized.endsWith(".ts")) {
    normalized = normalized.slice(0, -3);
  }
  return normalized;
};

/**
 * Checks if a file should be exported from mod.ts.
 *
 * @param fileName - File name to check
 * @returns Whether the file should be exported
 */
const shouldBeExported = (fileName: string): boolean => {
  // Skip mod.ts itself
  if (fileName === "mod.ts") {
    return false;
  }
  // Skip test and bench files
  if (fileName.endsWith("_test.ts") || fileName.endsWith("_bench.ts")) {
    return false;
  }
  // Skip private files
  if (fileName.startsWith("_")) {
    return false;
  }
  // Skip directories (check for subdirectory mod.ts instead)
  if (fileName.includes("/")) {
    return false;
  }
  return true;
};

/**
 * Checks mod.ts exports completeness for all workspace packages.
 *
 * @param options - Check options
 * @returns Check result
 */
export const checkModExports = async (
  options: CheckModExportsOptions = {},
): Promise<CheckModExportsResult> => {
  const { root = ".", failFast = false } = options;

  const packages = await workspaceDiscovery.discoverPackages(root);
  const missingExports: MissingExport[] = [];

  for (const pkg of packages) {
    const modPath = pathPosix.join(pkg.path, "mod.ts");

    // Check if mod.ts exists
    let modContent: string;
    try {
      modContent = await standardsRuntime.runtime.fs.readTextFile(modPath);
    } catch {
      // No mod.ts, skip this package
      continue;
    }

    const exports = extractExportsFromMod(modContent);
    const normalizedExports = new Set(
      [...exports].map((e) => normalizePath(e)),
    );

    // Get all files in package
    const files = await workspaceDiscovery.getPackageFiles(pkg.path);

    for (const file of files) {
      const fileName = pathPosix.basename(file);

      if (!shouldBeExported(fileName)) {
        continue;
      }

      const normalizedFile = normalizePath(file);

      if (!normalizedExports.has(normalizedFile)) {
        missingExports.push({
          packageName: pkg.name,
          file,
        });

        if (failFast) {
          return {
            isComplete: false,
            missingExports,
            packagesChecked: packages.length,
          };
        }
      }
    }
  }

  return {
    isComplete: missingExports.length === 0,
    missingExports,
    packagesChecked: packages.length,
  };
};

/**
 * CLI main function for standalone usage.
 */
const main = async (): Promise<void> => {
  console.log("Checking mod.ts exports...\n");

  const result = await checkModExports();

  console.log(`Checked ${result.packagesChecked} packages.`);

  if (!result.isComplete) {
    console.log(
      fmtColors.red(
        `\nFound ${result.missingExports.length} missing exports:\n`,
      ),
    );
    for (const missing of result.missingExports) {
      console.log(
        fmtColors.yellow(`  ${missing.packageName}: ${missing.file}`),
      );
    }
    standardsRuntime.runtime.process.exit(1);
  } else {
    console.log(fmtColors.green("\nAll mod.ts exports are complete."));
  }
};

if (import.meta.main) {
  await main();
}
