// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { runtime } from "@eser/standards/cross-runtime";
import type { PackageConfig, WorkspaceModule } from "./types.ts";
import { getBaseDir, load, PackageLoadError, tryLoad } from "./loader.ts";

/**
 * Error thrown when workspace configuration is invalid.
 */
export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

/**
 * Loads package configuration from a directory.
 * Throws an error if no config file is found.
 *
 * @param path - Directory to load config from
 * @returns PackageConfig with loaded configuration
 * @throws {WorkspaceError} If no package config file is found
 */
export const loadPackageConfig = async (
  path: string,
): Promise<PackageConfig> => {
  try {
    return await load({ baseDir: path });
  } catch (e) {
    if (e instanceof PackageLoadError) {
      throw new WorkspaceError(
        `No package config file found in ${runtime.path.resolve(path)}`,
      );
    }
    throw e;
  }
};

/**
 * Expands workspace patterns (including globs) to actual directory paths.
 *
 * Supports simple trailing `/*` patterns (e.g. `pkg/*`, `apps/*`).
 * Does NOT depend on `@std/fs/expand-glob`.
 */
const expandWorkspacePaths = async (
  root: string,
  patterns: ReadonlyArray<string>,
): Promise<string[]> => {
  const paths: string[] = [];

  for (const pattern of patterns) {
    // Check if pattern ends with a simple wildcard like "pkg/*"
    if (pattern.endsWith("/*")) {
      const parentDir = runtime.path.join(root, pattern.slice(0, -2));

      try {
        for await (const entry of runtime.fs.readDir(parentDir)) {
          if (entry.isDirectory) {
            paths.push(runtime.path.join(parentDir, entry.name));
          }
        }
      } catch {
        // Directory doesn't exist — skip silently
      }
    } else if (pattern.includes("*") || pattern.includes("?")) {
      // More complex glob — walk parent and match with regex
      const parts = pattern.split("/");
      const staticParts: string[] = [];
      let globStart = 0;

      for (let i = 0; i < parts.length; i++) {
        if (parts[i]!.includes("*") || parts[i]!.includes("?")) {
          globStart = i;
          break;
        }
        staticParts.push(parts[i]!);
      }

      const parentDir = runtime.path.join(root, ...staticParts);
      const globPart = parts.slice(globStart).join("/");
      const regexPattern = globPart
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]");
      const regex = new RegExp(`^${regexPattern}$`);

      try {
        for await (
          const entry of runtime.fs.walk(parentDir, {
            includeDirs: true,
            includeFiles: false,
          })
        ) {
          const rel = runtime.path.relative(parentDir, entry.path);
          if (rel !== "" && regex.test(rel)) {
            paths.push(entry.path);
          }
        }
      } catch {
        // Directory doesn't exist — skip silently
      }
    } else {
      // Direct path — no glob
      paths.push(runtime.path.join(root, pattern));
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
    throw new WorkspaceError("Package config doesn't have workspace field.");
  }

  // Validate all workspace entries are strings
  for (const workspace of workspaces) {
    if (typeof workspace !== "string") {
      throw new WorkspaceError(
        "Package config workspace field should be an array of strings.",
      );
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
