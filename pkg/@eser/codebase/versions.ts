// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Workspace version management tool.
 *
 * Can be used as a library or as a standalone script.
 *
 * Library usage:
 * ```typescript
 * import * as versions from "@eser/codebase/versions";
 *
 * // Show versions
 * const result = await versions.showVersions();
 * console.log(result.packages);
 *
 * // Sync versions
 * const syncResult = await versions.versions("sync", { dryRun: true });
 * console.log(syncResult.updates);
 * ```
 *
 * CLI usage:
 *   deno -A versions.ts              # Show versions table
 *   deno -A versions.ts sync         # Sync all to highest version
 *   deno -A versions.ts patch        # Bump patch, sync all
 *   deno -A versions.ts minor        # Bump minor, sync all
 *   deno -A versions.ts major        # Bump major, sync all
 *   deno -A versions.ts --dry-run    # Preview without changes
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as fmtColors from "@std/fmt/colors";
import * as stdSemver from "@std/semver";
import * as standardsRuntime from "@eser/standards/runtime";
import * as pkg from "./package/mod.ts";

/**
 * Valid version commands.
 */
export type VersionCommand = "sync" | "patch" | "minor" | "major";

/**
 * Options for version operations.
 */
export type VersionOptions = {
  /** Root directory (default: ".") */
  readonly root?: string;
  /** Preview changes without applying */
  readonly dryRun?: boolean;
};

/**
 * Information about a package version.
 */
export type PackageVersion = {
  /** Package name */
  readonly name: string;
  /** Package version */
  readonly version: string;
};

/**
 * Update information for a single package.
 */
export type VersionUpdate = {
  /** Package name */
  readonly name: string;
  /** Version before update */
  readonly from: string;
  /** Version after update */
  readonly to: string;
  /** Whether the package was updated */
  readonly changed: boolean;
};

/**
 * Result of showing versions.
 */
export type ShowVersionsResult = {
  /** All packages with their versions */
  readonly packages: PackageVersion[];
};

/**
 * Result of a version operation.
 */
export type VersionsResult = {
  /** Command that was executed */
  readonly command: VersionCommand;
  /** Target version */
  readonly targetVersion: string;
  /** All package updates */
  readonly updates: VersionUpdate[];
  /** Number of packages that changed */
  readonly changedCount: number;
  /** Whether this was a dry run */
  readonly dryRun: boolean;
};

/**
 * Finds the highest version from an array of version strings.
 */
const findHighestVersion = (versions: string[]): string => {
  let highest = stdSemver.parse("0.0.0");
  for (const version of versions) {
    const v = stdSemver.parse(version);
    if (stdSemver.compare(v, highest) > 0) {
      highest = v;
    }
  }
  return stdSemver.format(highest);
};

/**
 * Shows all package versions in the workspace.
 *
 * @param options - Options for the operation
 * @returns Result with package versions
 */
export const showVersions = async (
  options: VersionOptions = {},
): Promise<ShowVersionsResult> => {
  const { root = "." } = options;

  const [rootConfig, modules] = await pkg.getWorkspaceModules(root);

  const rootVersion = rootConfig.version?.value ?? "0.0.0";
  const rootName = rootConfig.name?.value ?? "(root)";

  const packages: PackageVersion[] = [
    { name: rootName, version: rootVersion },
    ...modules.map((m) => ({ name: m.name, version: m.version })),
  ];

  return { packages };
};

/**
 * Executes a version command (sync, patch, minor, major).
 *
 * @param command - The command to execute
 * @param options - Options for the operation
 * @returns Result of the operation
 */
export const versions = async (
  command: VersionCommand,
  options: VersionOptions = {},
): Promise<VersionsResult> => {
  const { root = ".", dryRun = false } = options;

  const [rootConfig, modules] = await pkg.getWorkspaceModules(root);

  const rootVersion = rootConfig.version?.value ?? "0.0.0";
  const rootName = rootConfig.name?.value ?? "(root)";

  // Calculate target version (including root)
  const allVersions = [rootVersion, ...modules.map((m) => m.version)];
  const highestVersion = findHighestVersion(allVersions);
  let targetVersion: string;

  if (command === "sync") {
    targetVersion = highestVersion;
  } else {
    targetVersion = stdSemver.format(
      stdSemver.increment(
        stdSemver.parse(highestVersion),
        command as stdSemver.ReleaseType,
      ),
    );
  }

  // Apply updates (including root)
  const updates: VersionUpdate[] = [];

  // Update root config
  const rootNeedsUpdate = rootVersion !== targetVersion;
  // Always call updateVersion to sync all files (including templates)
  if (!dryRun) {
    await pkg.updateVersion(rootConfig, targetVersion);
  }
  updates.push({
    name: rootName,
    from: rootVersion,
    to: targetVersion,
    changed: rootNeedsUpdate,
  });

  // Update workspace modules
  for (const module of modules) {
    const needsUpdate = module.version !== targetVersion;

    // Always call updateVersion to sync all files (including templates)
    if (!dryRun) {
      await pkg.updateVersion(module.config, targetVersion);
    }

    updates.push({
      name: module.name,
      from: module.version,
      to: targetVersion,
      changed: needsUpdate,
    });
  }

  const changedCount = updates.filter((u) => u.changed).length;

  return {
    command,
    targetVersion,
    updates,
    changedCount,
    dryRun,
  };
};

/**
 * CLI main function for standalone usage.
 */
const main = async (): Promise<void> => {
  // @ts-ignore parseArgs doesn't mutate the array, readonly is safe
  const args = cliParseArgs.parseArgs(standardsRuntime.runtime.process.args, {
    boolean: ["dry-run"],
  });

  const command = args._[0] as VersionCommand | undefined;
  const dryRun = args["dry-run"] as boolean;

  // No command: show versions table
  if (command === undefined) {
    const result = await showVersions();
    console.table(result.packages);
    return;
  }

  // Validate command
  const validCommands = ["sync", "patch", "minor", "major"];
  if (!validCommands.includes(command)) {
    console.error(`Invalid command: ${command}`);
    console.error(`Usage: versions.ts [sync|patch|minor|major] [--dry-run]`);
    standardsRuntime.runtime.process.exit(1);
  }

  // Execute command
  if (command === "sync") {
    console.log(`Syncing all versions...`);
  } else {
    console.log(`Bumping all versions (${command})...`);
  }

  const result = await versions(command, { dryRun });

  console.log(`Target version: ${result.targetVersion}`);
  console.table(result.updates);

  if (dryRun) {
    console.log(
      fmtColors.cyan(
        `Dry run - ${result.changedCount} packages would be modified.`,
      ),
    );
  } else {
    console.log(`Done. Updated ${result.changedCount} packages.`);
  }
};

if (import.meta.main) {
  await main();
}
