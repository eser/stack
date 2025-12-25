// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Circular dependency checker for workspace packages.
 *
 * Detects circular dependencies between packages in the workspace.
 *
 * Library usage:
 * ```typescript
 * import * as circularDeps from "@eser/codebase/check-circular-deps";
 *
 * const result = await circularDeps.checkCircularDeps();
 * if (result.hasCycles) {
 *   console.log("Cycles found:", result.cycles);
 * }
 * ```
 *
 * CLI usage:
 *   deno -A check-circular-deps.ts
 *
 * @module
 */

import * as fmtColors from "@std/fmt/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import * as workspaceDiscovery from "./workspace-discovery.ts";

/**
 * Options for circular dependency checking.
 */
export type CheckCircularDepsOptions = {
  /** Root directory (default: ".") */
  readonly root?: string;
};

/**
 * Result of circular dependency check.
 */
export type CheckCircularDepsResult = {
  /** Whether any cycles were found */
  readonly hasCycles: boolean;
  /** Detected cycles (each cycle is an array of package names) */
  readonly cycles: string[][];
  /** Number of packages checked */
  readonly packagesChecked: number;
};

/**
 * Builds a dependency graph from package configurations.
 *
 * @param packages - Discovered packages
 * @returns Map of package name to its dependencies
 */
const buildDependencyGraph = (
  packages: workspaceDiscovery.DiscoveredPackage[],
): Map<string, string[]> => {
  const graph = new Map<string, string[]>();
  const packageNames = new Set(packages.map((p) => p.name));

  for (const pkg of packages) {
    const deps: string[] = [];

    // Get dependencies from raw loaded files (package.json)
    for (const file of pkg.config._loadedFiles) {
      const content = file.content as Record<string, unknown>;

      // Check dependencies field
      const dependencies = content["dependencies"] as
        | Record<string, string>
        | undefined;
      if (dependencies !== undefined) {
        for (const depName of Object.keys(dependencies)) {
          if (packageNames.has(depName)) {
            deps.push(depName);
          }
        }
      }

      // Check imports field (deno.json style)
      const imports = content["imports"] as Record<string, string> | undefined;
      if (imports !== undefined) {
        for (const value of Object.values(imports)) {
          if (packageNames.has(value)) {
            deps.push(value);
          }
        }
      }
    }

    graph.set(pkg.name, [...new Set(deps)]); // dedupe
  }

  return graph;
};

/**
 * Detects cycles in a directed graph using DFS.
 *
 * @param graph - Dependency graph
 * @returns Array of detected cycles
 */
const detectCycles = (graph: Map<string, string[]>): string[][] => {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  const dfs = (node: string): void => {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);
        cycle.push(neighbor); // Complete the cycle
        cycles.push(cycle);
      }
    }

    path.pop();
    recursionStack.delete(node);
  };

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
};

/**
 * Checks for circular dependencies between workspace packages.
 *
 * @param options - Check options
 * @returns Check result
 */
export const checkCircularDeps = async (
  options: CheckCircularDepsOptions = {},
): Promise<CheckCircularDepsResult> => {
  const { root = "." } = options;

  const packages = await workspaceDiscovery.discoverPackages(root);
  const graph = buildDependencyGraph(packages);
  const cycles = detectCycles(graph);

  return {
    hasCycles: cycles.length > 0,
    cycles,
    packagesChecked: packages.length,
  };
};

/**
 * CLI main function for standalone usage.
 */
const main = async (): Promise<void> => {
  console.log("Checking for circular dependencies...\n");

  const result = await checkCircularDeps();

  console.log(`Checked ${result.packagesChecked} packages.`);

  if (result.hasCycles) {
    console.log(
      fmtColors.red(`\nFound ${result.cycles.length} circular dependencies:\n`),
    );
    for (const cycle of result.cycles) {
      console.log(fmtColors.yellow(`  ${cycle.join(" → ")}`));
    }
    standardsRuntime.runtime.process.exit(1);
  } else {
    console.log(fmtColors.green("\nNo circular dependencies found."));
  }
};

if (import.meta.main) {
  await main();
}
