// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Circular dependency checker for workspace packages.
 *
 * Detects circular dependencies between packages in the workspace.
 *
 * Library usage:
 * ```typescript
 * import * as circularDeps from "@eserstack/codebase/validate-circular-deps";
 *
 * const result = await circularDeps.checkCircularDeps();
 * if (result.hasCycles) {
 *   console.log("Cycles found:", result.cycles);
 * }
 * ```
 *
 * CLI usage:
 *   deno run --allow-all ./validate-circular-deps.ts
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import * as functions from "@eserstack/functions";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import * as workspaceDiscovery from "./workspace-discovery.ts";
import { createCliOutput, runCliMain } from "./cli-support.ts";

const out = createCliOutput();

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

// --- Handler ---

/** Handler: wraps checkCircularDeps as a Task via fromPromise. */
export const checkCircularDepsHandler: functions.handler.Handler<
  CheckCircularDepsOptions,
  CheckCircularDepsResult,
  Error
> = (input) => functions.task.fromPromise(() => checkCircularDeps(input));

// --- CLI Adapter ---

/** Adapter: functions.triggers.CliEvent → CheckCircularDepsOptions (no flags needed). */
const cliAdapter: functions.handler.Adapter<
  functions.triggers.CliEvent,
  CheckCircularDepsOptions
> = (
  _event,
) => primitives.results.ok({ root: "." });

// --- CLI ResponseMapper ---

/** ResponseMapper: formats CheckCircularDepsResult for CLI output. */
const cliResponseMapper: functions.handler.ResponseMapper<
  CheckCircularDepsResult,
  Error | functions.handler.AdaptError,
  shellArgs.CliResult<void>
> = (result) => {
  if (primitives.results.isFail(result)) {
    out.writeln(
      span.red("✗"),
      span.text(
        " " +
          (result.error instanceof Error
            ? result.error.message
            : String(result.error)),
      ),
    );
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;
  out.writeln(
    span.blue("ℹ"),
    span.text(` Checked ${value.packagesChecked} packages.`),
  );

  if (value.hasCycles) {
    out.writeln(
      span.red("✗"),
      span.text(
        ` Found ${value.cycles.length} circular dependencies:`,
      ),
    );
    for (const cycle of value.cycles) {
      out.writeln(
        span.yellow("⚠"),
        span.text(` ${cycle.join(" → ")}`),
      );
    }
    return primitives.results.fail({ exitCode: 1 });
  }

  out.writeln(
    span.green("✓"),
    span.text(" No circular dependencies found."),
  );
  return primitives.results.ok(undefined);
};

// --- CLI Trigger ---

/** Runnable CLI trigger for check-circular-deps. */
export const handleCli: (
  event: functions.triggers.CliEvent,
) => Promise<shellArgs.CliResult<void>> = functions.handler.createTrigger({
  handler: checkCircularDepsHandler,
  adaptInput: cliAdapter,
  adaptOutput: cliResponseMapper,
});

/** CLI entry point for dispatcher compatibility. */
export const main = async (
  _cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> =>
  await handleCli({ command: "validate-circular-deps", args: [], flags: {} });

if (import.meta.main) {
  runCliMain(await main(), out);
}
