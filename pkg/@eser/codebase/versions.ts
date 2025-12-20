// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Workspace version management tool.
 *
 * Usage:
 *   deno -A versions.ts              # Show versions table
 *   deno -A versions.ts sync         # Sync all to highest version
 *   deno -A versions.ts patch        # Bump patch, sync all
 *   deno -A versions.ts minor        # Bump minor, sync all
 *   deno -A versions.ts major        # Bump major, sync all
 *   deno -A versions.ts --dry-run    # Preview without changes
 *
 * @module
 */

import { parseArgs } from "@std/cli/parse-args";
import { cyan } from "@std/fmt/colors";
import {
  compare,
  format as formatSemver,
  increment,
  parse as parseSemVer,
  type ReleaseType,
} from "@std/semver";
import { runtime } from "@eser/standards/runtime";
import * as pkg from "./package/mod.ts";

type Command = "sync" | "patch" | "minor" | "major";

function findHighestVersion(versions: string[]): string {
  let highest = parseSemVer("0.0.0");
  for (const version of versions) {
    const v = parseSemVer(version);
    if (compare(v, highest) > 0) {
      highest = v;
    }
  }
  return formatSemver(highest);
}

async function main() {
  const args = parseArgs([...runtime.process.args], {
    boolean: ["dry-run"],
  });

  const command = args._[0] as Command | undefined;
  const dryRun = args["dry-run"];

  const [rootConfig, modules] = await pkg.getWorkspaceModules(".");

  // Extract root info
  const rootVersion = rootConfig.version?.value ?? "0.0.0";
  const rootName = rootConfig.name?.value ?? "(root)";

  // No command: show versions table (including root)
  if (!command) {
    const table = [
      { name: rootName, version: rootVersion },
      ...modules.map((m) => ({ name: m.name, version: m.version })),
    ];
    console.table(table);
    return;
  }

  // Validate command
  const validCommands = ["sync", "patch", "minor", "major"];
  if (!validCommands.includes(command)) {
    console.error(`Invalid command: ${command}`);
    console.error(`Usage: versions.ts [sync|patch|minor|major] [--dry-run]`);
    runtime.process.exit(1);
  }

  // Calculate target version (including root)
  const allVersions = [rootVersion, ...modules.map((m) => m.version)];
  const highestVersion = findHighestVersion(allVersions);
  let targetVersion: string;

  if (command === "sync") {
    targetVersion = highestVersion;
    console.log(`Syncing all versions to: ${targetVersion}`);
  } else {
    targetVersion = formatSemver(
      increment(parseSemVer(highestVersion), command as ReleaseType),
    );
    console.log(
      `Bumping all versions: ${highestVersion} → ${targetVersion} (${command})`,
    );
  }

  // Apply updates (including root)
  const updates: Array<
    { name: string; from: string; to: string; changed: boolean }
  > = [];

  // Update root config
  const rootNeedsUpdate = rootVersion !== targetVersion;
  if (rootNeedsUpdate && !dryRun) {
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

    if (needsUpdate && !dryRun) {
      await pkg.updateVersion(module.config, targetVersion);
    }

    updates.push({
      name: module.name,
      from: module.version,
      to: targetVersion,
      changed: needsUpdate,
    });
  }

  console.table(updates);

  const changedCount = updates.filter((u) => u.changed).length;
  if (dryRun) {
    console.log(cyan(`Dry run - ${changedCount} packages would be modified.`));
  } else {
    console.log(`Done. Updated ${changedCount} packages.`);
  }
}

if (import.meta.main) {
  await main();
}
