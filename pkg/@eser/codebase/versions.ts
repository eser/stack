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
import * as stdPath from "@std/path";
import * as stdSemver from "@std/semver";
import * as primitives from "@eser/primitives";
import * as standards from "@eser/standards";
import * as functions from "@eser/functions";
import type * as shellArgs from "@eser/shell/args";
import * as span from "@eser/streams/span";
import { createCliOutput, runCliMain, toCliEvent } from "./cli-support.ts";
import * as pkg from "./package/mod.ts";

const out = createCliOutput();

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
    const content = await standards.runtime.current.fs.readTextFile(
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
  await standards.runtime.current.fs.writeTextFile(
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

// --- Handler / Adapter / ResponseMapper (CLI layer) ---

/**
 * Discriminated input for the versions functions.handler.
 */
export type VersionsInput =
  | { readonly mode: "show" }
  | {
    readonly mode: "update";
    readonly command: VersionCommand;
    readonly options: VersionOptions;
  };

/**
 * Discriminated output from the versions functions.handler.
 */
export type VersionsOutput =
  | { readonly mode: "show"; readonly result: ShowVersionsResult }
  | { readonly mode: "update"; readonly result: VersionsResult };

/**
 * Core handler — wraps existing library functions using `fromPromise`.
 */
export const versionsHandler: functions.handler.Handler<
  VersionsInput,
  VersionsOutput,
  Error
> = (
  input,
) => {
  if (input.mode === "show") {
    return functions.task.fromPromise(
      async () => {
        const result = await showVersions();
        return { mode: "show" as const, result };
      },
    );
  }

  return functions.task.fromPromise(
    async () => {
      const result = await versions(input.command, input.options);
      return { mode: "update" as const, result };
    },
  );
};

/**
 * CLI Adapter — converts a `functions.triggers.CliEvent` into `VersionsInput`.
 */
const cliAdapter: functions.handler.Adapter<
  functions.triggers.CliEvent,
  VersionsInput
> = (event) => {
  const arg = event.args[0] as string | undefined;

  // No args → show mode
  if (arg === undefined) {
    return primitives.results.ok({ mode: "show" as const });
  }

  // Has arg → update mode
  const validCommands = ["sync", "patch", "minor", "major"];
  let command: VersionCommand;
  let explicitVersion: string | undefined;

  if (validCommands.includes(arg)) {
    command = arg as VersionCommand;
  } else {
    command = "explicit";
    explicitVersion = arg;
  }

  const dryRun = event.flags["dry-run"] === true;

  return primitives.results.ok({
    mode: "update" as const,
    command,
    options: { dryRun, explicitVersion },
  });
};

/**
 * CLI ResponseMapper — formats handler output for terminal display.
 */
const cliResponseMapper: functions.handler.ResponseMapper<
  VersionsOutput,
  Error | functions.handler.AdaptError,
  shellArgs.CliResult<void>
> = (result) => {
  if (primitives.results.isFail(result)) {
    return primitives.results.fail({
      exitCode: 1,
      message: String(result.error),
    });
  }

  const handlerOutput = result.value;

  if (handlerOutput.mode === "show") {
    console.table(handlerOutput.result.packages);
    return primitives.results.ok(undefined);
  }

  // Update mode
  const { result: updateResult } = handlerOutput;

  if (updateResult.command === "sync") {
    out.writeln(span.blue("ℹ"), span.text(" Syncing all versions..."));
  } else if (updateResult.command === "explicit") {
    out.writeln(
      span.blue("ℹ"),
      span.text(
        ` Setting all versions to ${updateResult.targetVersion}...`,
      ),
    );
  } else {
    out.writeln(
      span.blue("ℹ"),
      span.text(` Bumping all versions (${updateResult.command})...`),
    );
  }

  out.writeln(
    span.blue("ℹ"),
    span.text(` Target version: ${updateResult.targetVersion}`),
  );
  console.table(updateResult.updates);

  for (const fileUpdate of updateResult.fileUpdates) {
    if (fileUpdate.changed) {
      out.writeln(
        span.blue("ℹ"),
        span.text(
          ` ${fileUpdate.path} (${fileUpdate.from} → ${fileUpdate.to})`,
        ),
      );
    }
  }

  if (updateResult.dryRun) {
    out.writeln(
      span.blue("ℹ"),
      span.text(
        ` Dry run - ${updateResult.changedCount} packages would be modified.`,
      ),
    );
  } else {
    out.writeln(
      span.green("✓"),
      span.text(
        ` Done. Updated ${updateResult.changedCount} packages.`,
      ),
    );
  }

  return primitives.results.ok(undefined);
};

/**
 * CLI trigger — wired handler for command-line invocation.
 */
export const handleCli: (
  event: functions.triggers.CliEvent,
) => Promise<shellArgs.CliResult<void>> = functions.handler.createTrigger({
  handler: versionsHandler,
  adaptInput: cliAdapter,
  adaptOutput: cliResponseMapper,
});

/** CLI entry point for dispatcher compatibility. */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(
    (cliArgs ?? []) as string[],
    { boolean: ["dry-run"] },
  );
  const event = toCliEvent("versions", parsed);
  return await handleCli(event);
};

if (import.meta.main) {
  runCliMain(
    await main(standards.runtime.current.process.args as string[]),
    out,
  );
}
