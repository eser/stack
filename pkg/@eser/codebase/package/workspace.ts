// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as posix from "@std/path/posix";
import * as fs from "@std/fs/expand-glob";
import { runtime } from "@eser/standards/runtime";
import type { PackageConfig, WorkspaceModule } from "./types.ts";
import { getBaseDir, load, PackageLoadError, tryLoad } from "./loader.ts";

/**
 * Loads package configuration from a directory.
 * Exits the process with an error message if no config file is found.
 *
 * @param path - Directory to load config from
 * @returns PackageConfig with loaded configuration
 */
export const loadPackageConfig = async (
  path: string,
): Promise<PackageConfig> => {
  try {
    return await load({ baseDir: path });
  } catch (e) {
    if (e instanceof PackageLoadError) {
      console.log(`No package config file found in ${posix.resolve(path)}`);
      runtime.process.exit(1);
    }
    throw e;
  }
};

/**
 * Expands workspace patterns (including globs) to actual directory paths.
 */
const expandWorkspacePaths = async (
  root: string,
  patterns: ReadonlyArray<string>,
): Promise<string[]> => {
  const paths: string[] = [];

  for (const pattern of patterns) {
    const fullPattern = posix.join(root, pattern);

    // Check if pattern contains glob characters
    if (pattern.includes("*") || pattern.includes("?")) {
      // Expand glob pattern
      for await (
        const entry of fs.expandGlob(fullPattern, { includeDirs: true })
      ) {
        if (entry.isDirectory) {
          paths.push(entry.path);
        }
      }
    } else {
      // Direct path
      paths.push(fullPattern);
    }
  }

  return paths;
};

/**
 * Gets all workspace member modules from a root configuration.
 *
 * @param root - Root directory containing workspace config
 * @returns Tuple of [root config, workspace modules]
 */
export const getWorkspaceModules = async (
  root: string,
): Promise<[PackageConfig, WorkspaceModule[]]> => {
  const rootConfig = await loadPackageConfig(root);
  const workspaces = rootConfig.workspaces?.value;

  if (!Array.isArray(workspaces)) {
    console.log("Package config doesn't have workspace field.");
    runtime.process.exit(1);
  }

  // Validate all workspace entries are strings
  for (const workspace of workspaces) {
    if (typeof workspace !== "string") {
      console.log(
        "Package config workspace field should be an array of strings.",
      );
      runtime.process.exit(1);
    }
  }

  // Expand glob patterns to actual paths
  const workspacePaths = await expandWorkspacePaths(
    root,
    workspaces as string[],
  );

  const result: WorkspaceModule[] = [];
  for (const workspacePath of workspacePaths) {
    const workspaceConfig = await tryLoad({ baseDir: workspacePath });

    if (workspaceConfig === undefined) {
      continue;
    }

    const name = workspaceConfig.name?.value;
    const version = workspaceConfig.version?.value;
    const isPrivate = workspaceConfig.private?.value;

    if (name === undefined) {
      continue;
    }

    // Skip private packages (test apps, etc.)
    if (isPrivate === true) {
      continue;
    }

    result.push({
      name,
      version: version ?? "0.0.0",
      config: workspaceConfig,
    });
  }

  return [rootConfig, result];
};

/**
 * Finds a module by name in a list of workspace modules.
 * Matches either the full name or a partial name suffix.
 *
 * @param module - Module name to find (can be partial, e.g., "config" matches "@eser/config")
 * @param modules - List of workspace modules to search
 * @returns The matching module or undefined
 */
export const getModule = (
  module: string,
  modules: WorkspaceModule[],
): WorkspaceModule | undefined => {
  return modules.find(
    (m) => m.name === module || m.name.endsWith(`/${module}`),
  );
};

// Re-export getBaseDir for convenience
export { getBaseDir };
