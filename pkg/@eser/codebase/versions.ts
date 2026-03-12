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
 *   deno run --allow-all ./versions.ts              # Show versions table
 *   deno run --allow-all ./versions.ts sync         # Sync all to highest version
 *   deno run --allow-all ./versions.ts patch        # Bump patch, sync all
 *   deno run --allow-all ./versions.ts minor        # Bump minor, sync all
 *   deno run --allow-all ./versions.ts major        # Bump major, sync all
 *   deno run --allow-all ./versions.ts --dry-run    # Preview without changes
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as fmtColors from "@std/fmt/colors";
import * as stdPath from "@std/path";
import * as stdSemver from "@std/semver";
import * as results from "@eser/primitives/results";
import * as standardsRuntime from "@eser/standards/runtime";
import * as shellArgs from "@eser/shell/args";
import * as pkg from "./package/mod.ts";

/**
 * Valid version commands.
 */
export type VersionCommand = "sync" | "patch" | "minor" | "major" | "explicit";

/**
 * Options for version operations.
 */
export type VersionOptions = {
  /** Root directory (default: ".") */
  readonly root?: string;
  /** Preview changes without applying */
  readonly dryRun?: boolean;
  /** Update the VERSION file in root (default: true) */
  readonly updateVersionFile?: boolean;
  /** Explicit version string (used when command is "explicit") */
  readonly explicitVersion?: string;
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
 * Update information for a standalone file (e.g., VERSION).
 */
export type FileUpdate = {
  /** File path relative to root */
  readonly path: string;
  /** Version before update */
  readonly from: string;
  /** Version after update */
  readonly to: string;
  /** Whether the file was updated */
  readonly changed: boolean;
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
  /** Standalone file updates (e.g., VERSION file) */
  readonly fileUpdates: FileUpdate[];
  /** Number of packages that changed */
  readonly changedCount: number;
  /** Whether this was a dry run */
  readonly dryRun: boolean;
};

/**
 * Reads the current version from the VERSION file.
 *
 * @param options - Options with root directory
 * @returns The version string, or undefined if the file doesn't exist
 */
export const readVersionFile = async (
  options: VersionOptions = {},
): Promise<string | undefined> => {
  const { root = "." } = options;
  const versionFilePath = stdPath.join(root, "VERSION");
  try {
    const content = await standardsRuntime.runtime.fs.readTextFile(
      versionFilePath,
    );
    return content.trim();
  } catch {
    return undefined;
  }
};

/**
 * Writes a version string to the VERSION file.
 */
const writeVersionFile = async (
  root: string,
  version: string,
): Promise<void> => {
  const versionFilePath = stdPath.join(root, "VERSION");
  await standardsRuntime.runtime.fs.writeTextFile(
    versionFilePath,
    version + "\n",
  );
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
  const {
    root = ".",
    dryRun = false,
    updateVersionFile: shouldUpdateVersionFile = true,
  } = options;

  const [rootConfig, modules] = await pkg.getWorkspaceModules(root);

  const rootVersion = rootConfig.version?.value ?? "0.0.0";
  const rootName = rootConfig.name?.value ?? "(root)";

  // Calculate target version
  const allVersions = [rootVersion, ...modules.map((m) => m.version)];
  const highestVersion = findHighestVersion(allVersions);
  let targetVersion: string;

  if (command === "explicit") {
    if (options.explicitVersion === undefined) {
      throw new Error(
        'explicitVersion is required when command is "explicit".',
      );
    }
    stdSemver.parse(options.explicitVersion); // validate format
    targetVersion = options.explicitVersion;
  } else if (command === "sync") {
    targetVersion = highestVersion;
  } else {
    targetVersion = stdSemver.format(
      stdSemver.increment(
        stdSemver.parse(highestVersion),
        command as stdSemver.ReleaseType,
      ),
    );
  }

  // Apply package updates (including root)
  const updates: VersionUpdate[] = [];

  // Update root config
  const rootNeedsUpdate = rootVersion !== targetVersion;
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

  // Update VERSION file
  const fileUpdates: FileUpdate[] = [];

  if (shouldUpdateVersionFile) {
    const currentFileVersion = await readVersionFile({ root });
    const fileChanged = currentFileVersion !== targetVersion;

    if (!dryRun && fileChanged) {
      await writeVersionFile(root, targetVersion);
    }

    fileUpdates.push({
      path: "VERSION",
      from: currentFileVersion ?? "",
      to: targetVersion,
      changed: fileChanged,
    });
  }

  const changedCount = updates.filter((u) => u.changed).length;

  return {
    command,
    targetVersion,
    updates,
    fileUpdates,
    changedCount,
    dryRun,
  };
};

/**
 * CLI main function for standalone usage.
 */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const args = cliParseArgs.parseArgs(
    (cliArgs ?? standardsRuntime.runtime.process.args) as string[],
    { boolean: ["dry-run"] },
  );

  const input = args._[0] as string | undefined;
  const dryRun = args["dry-run"] as boolean;

  // No command: show versions table
  if (input === undefined) {
    const result = await showVersions();
    console.table(result.packages);
    return results.ok(undefined);
  }

  // Determine command and options
  const validCommands = ["sync", "patch", "minor", "major"];
  let command: VersionCommand;
  let explicitVersion: string | undefined;

  if (validCommands.includes(input)) {
    command = input as VersionCommand;
  } else {
    command = "explicit";
    explicitVersion = input;
  }

  // Execute command
  if (command === "sync") {
    console.log(`Syncing all versions...`);
  } else if (command === "explicit") {
    console.log(`Setting all versions to ${explicitVersion}...`);
  } else {
    console.log(`Bumping all versions (${command})...`);
  }

  const result = await versions(command, { dryRun, explicitVersion });

  console.log(`Target version: ${result.targetVersion}`);
  console.table(result.updates);

  for (const fileUpdate of result.fileUpdates) {
    if (fileUpdate.changed) {
      console.log(
        `  ${fileUpdate.path} (${fileUpdate.from} → ${fileUpdate.to})`,
      );
    }
  }

  if (dryRun) {
    console.log(
      fmtColors.cyan(
        `Dry run - ${result.changedCount} packages would be modified.`,
      ),
    );
  } else {
    console.log(`Done. Updated ${result.changedCount} packages.`);
  }

  return results.ok(undefined);
};

if (import.meta.main) {
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        console.error(error.message);
      }
      standardsRuntime.runtime.process.setExitCode(error.exitCode);
    },
  });
}
