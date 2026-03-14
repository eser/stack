// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dynamic dispatch — routes CLI subcommands to library module `main()` functions.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import { registry } from "./registry.ts";

/**
 * Shows available modules for a package namespace.
 */
export const showPackageHelp = (packageName: string): void => {
  const pkg = registry[packageName];
  if (pkg === undefined) {
    return;
  }

  console.log(`eser ${packageName} - ${pkg.description}\n`);
  console.log(`Usage: eser ${packageName} <module> [options]\n`);

  // Group modules by category
  const grouped = new Map<string, [string, typeof pkg.modules[string]][]>();
  for (const [name, entry] of Object.entries(pkg.modules)) {
    const category = entry.category ?? "Modules";
    const group = grouped.get(category) ?? [];
    group.push([name, entry]);
    grouped.set(category, group);
  }

  for (const [category, modules] of grouped) {
    console.log(`${category}:`);
    for (const [name, entry] of modules) {
      console.log(`  ${name.padEnd(24)} ${entry.description}`);
    }
    console.log();
  }

  if (pkg.aliases !== undefined && Object.keys(pkg.aliases).length > 0) {
    console.log("\nAliases:");
    for (const [alias, target] of Object.entries(pkg.aliases)) {
      console.log(`  ${alias.padEnd(24)} → ${target}`);
    }
  }

  console.log(
    `\nRun 'eser ${packageName} <module> --help' for module-specific help.`,
  );
};

/**
 * Dispatches a CLI invocation to a library module's `main()` function.
 *
 * @param packageName - The package namespace (e.g., "codebase")
 * @param moduleName - The module name (e.g., "versions")
 * @param remainingArgs - Arguments to pass to the module's main()
 * @returns Result from the module's main()
 */
export const dispatch = async (
  packageName: string,
  moduleName: string,
  remainingArgs: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const pkg = registry[packageName];
  if (pkg === undefined) {
    return results.fail({
      message: `Unknown package: ${packageName}`,
      exitCode: 1,
    });
  }

  // Resolve aliases (e.g., "init" → "scaffolding")
  const resolvedName = pkg.aliases?.[moduleName] ?? moduleName;
  const entry = pkg.modules[resolvedName];

  if (entry === undefined) {
    console.error(`Unknown module: ${packageName} ${moduleName}\n`);
    showPackageHelp(packageName);
    return results.fail({ exitCode: 1 });
  }

  const mod = await entry.load();
  return await mod.main(remainingArgs);
};
