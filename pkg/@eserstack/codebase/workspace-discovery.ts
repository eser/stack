// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Workspace discovery utilities for codebase validation tools.
 *
 * Provides functions to discover packages, extract entrypoints, and resolve
 * module paths within a workspace.
 *
 * @example
 * ```typescript
 * import * as discovery from "@eserstack/codebase/workspace-discovery";
 *
 * // Discover all packages in workspace
 * const packages = await discovery.discoverPackages(".");
 *
 * // Extract entrypoints from a package
 * const entrypoints = discovery.extractEntrypoints(packageConfig);
 *
 * // Resolve a module path
 * const resolved = discovery.resolveModulePath("./utils.ts", "/path/to/package");
 * ```
 *
 * @module
 */

import * as patterns from "@eserstack/standards/patterns";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as pkg from "./package/mod.ts";
import type { PackageConfig, WorkspaceModule } from "./package/types.ts";

/**
 * Information about a discovered package.
 */
export type DiscoveredPackage = {
  /** Package name (e.g., "@eserstack/config") */
  readonly name: string;
  /** Package version */
  readonly version: string;
  /** Absolute path to package directory */
  readonly path: string;
  /** Package configuration */
  readonly config: PackageConfig;
  /** Package entrypoints (export paths) */
  readonly entrypoints: string[];
};

/**
 * Discovers all packages in a workspace.
 *
 * @param root - Root directory containing workspace configuration
 * @returns Array of discovered packages with their configurations
 */
export const discoverPackages = async (
  root: string = ".",
): Promise<DiscoveredPackage[]> => {
  const [_rootConfig, modules] = await pkg.getWorkspaceModules(root);

  return modules.map((module) => ({
    name: module.name,
    version: module.version,
    path: pkg.getBaseDir(module.config),
    config: module.config,
    entrypoints: extractEntrypoints(module.config),
  }));
};

/**
 * Extracts all entrypoint paths from a package configuration.
 *
 * Entrypoints are derived from the package's exports field.
 *
 * @param config - Package configuration
 * @returns Array of entrypoint file paths (relative to package directory)
 */
export const extractEntrypoints = (config: PackageConfig): string[] => {
  const exports = config.exports?.value;

  if (exports === null || exports === undefined) {
    return [];
  }

  if (typeof exports === "string") {
    return [exports];
  }

  if (exports !== null && typeof exports === "object") {
    const paths: string[] = [];
    for (const value of Object.values(exports)) {
      if (typeof value === "string") {
        paths.push(value);
      }
    }
    return paths;
  }

  return [];
};

/**
 * Resolves a module specifier to an absolute path.
 *
 * @param specifier - Module specifier (relative or absolute)
 * @param basePath - Base path for resolution
 * @returns Resolved absolute path
 */
export const resolveModulePath = (
  specifier: string,
  basePath: string,
): string => {
  if (runtime.path.isAbsolute(specifier)) {
    return specifier;
  }

  return runtime.path.resolve(basePath, specifier);
};

/** `x.test.ts`, `x.bench.tsx`, `x_test.js` and the other test and bench names. */
const TEST_OR_BENCH_FILE = /[._](?:test|bench)\.[cm]?[jt]sx?$/;

/**
 * Gets all TypeScript files in a package directory.
 *
 * Excludes test and benchmark files (`*.test.ts` and `*.bench.ts`, and the
 * older `*_test.ts` and `*_bench.ts` forms, for every JS and TS extension),
 * private files (`_*.ts`) and `testdata/` directories.
 *
 * @param packagePath - Path to package directory
 * @returns Array of TypeScript file paths (relative to package directory)
 */
export const getPackageFiles = async (
  packagePath: string,
): Promise<string[]> => {
  const files: string[] = [];

  for await (
    const entry of runtime.fs.walk(packagePath, {
      exts: patterns.JS_FILE_EXTENSIONS,
      includeDirs: false,
      skip: [/node_modules/, /\.git/],
    })
  ) {
    const relativePath = runtime.path.relative(packagePath, entry.path);
    const fileName = runtime.path.basename(relativePath);

    if (TEST_OR_BENCH_FILE.test(fileName)) {
      continue;
    }

    // Skip private files (starting with _)
    if (fileName.startsWith("_")) {
      continue;
    }

    // Skip testdata directories. Split on both separators so the check also
    // holds for the backslash paths runtime.path.relative returns on Windows.
    if (relativePath.split(/[\\/]/).includes("testdata")) {
      continue;
    }

    files.push(`./${relativePath}`);
  }

  return files.sort();
};

/**
 * Gets the root package configuration and all workspace modules.
 *
 * This is a convenience wrapper around pkg.getWorkspaceModules.
 *
 * @param root - Root directory
 * @returns Tuple of [root config, workspace modules]
 */
export const getWorkspace = (
  root: string = ".",
): Promise<[PackageConfig, WorkspaceModule[]]> => {
  return pkg.getWorkspaceModules(root);
};
