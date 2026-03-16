// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Script executor — resolves and runs scripts from .manifest.yml.
 *
 * Supports:
 * - String shorthand: `ok: "eser workflows run -e precommit"`
 * - Object form: `{ command, description, workingDirectory, depends }`
 * - Dependency resolution with cycle detection
 * - Arg passing (remaining CLI args appended to command)
 *
 * @module
 */

import * as shellExec from "@eser/shell/exec";
import * as results from "@eser/primitives/results";
import * as fmtColors from "@eser/shell/formatting/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import type * as shellArgs from "@eser/shell/args";
import type { ScriptConfig } from "@eser/workflows";

/** Parsed representation of a script config entry. */
type ParsedScript = {
  readonly command: string;
  readonly description: string;
  readonly workingDirectory: string | undefined;
  readonly depends: readonly string[];
};

/**
 * Parse a script config entry into a normalized form.
 *
 * String values are treated as the command with sensible defaults.
 * Object values have their fields extracted with defaults applied.
 */
export const parseScript = (
  name: string,
  config: ScriptConfig,
): ParsedScript => {
  if (typeof config === "string") {
    return {
      command: config,
      description: name,
      workingDirectory: undefined,
      depends: [],
    };
  }

  return {
    command: config.command,
    description: config.description ?? name,
    workingDirectory: config.workingDirectory,
    depends: config.depends ?? [],
  };
};

/**
 * Resolve the dependency graph for a script using topological DFS.
 *
 * Returns an ordered list of script names that must execute before
 * the target script. Throws on circular or missing dependencies.
 */
export const resolveDependencies = (
  name: string,
  scripts: Readonly<Record<string, ScriptConfig>>,
  visited: Set<string> = new Set(),
  resolved: Set<string> = new Set(),
): readonly string[] => {
  if (resolved.has(name)) {
    return [];
  }

  if (visited.has(name)) {
    throw new Error(
      `Circular dependency detected: ${name} depends on itself (cycle in dependency chain)`,
    );
  }

  const config = scripts[name];
  if (config === undefined) {
    throw new Error(`Unknown script dependency: "${name}"`);
  }

  visited.add(name);

  const parsed = parseScript(name, config);
  const order: string[] = [];

  for (const dep of parsed.depends) {
    const depOrder = resolveDependencies(dep, scripts, visited, resolved);
    for (const d of depOrder) {
      if (!resolved.has(d)) {
        order.push(d);
        resolved.add(d);
      }
    }
  }

  resolved.add(name);
  return order;
};

/**
 * Resolve the CLI self-invocation prefix.
 *
 * When scripts reference `eser` as a command, we replace it with the
 * current runtime's exec path + the CLI entrypoint so scripts work
 * without requiring a global `eser` installation.
 */
const resolveCliPrefix = (): string => {
  const mainUrl = new URL("./main.ts", import.meta.url);
  const mainPath = mainUrl.protocol === "file:"
    ? mainUrl.pathname
    : mainUrl.href;
  const execPath = standardsRuntime.current.process.execPath();

  return `${execPath} run --allow-all ${mainPath}`;
};

/**
 * Replace a leading `eser ` token in a command with the resolved CLI
 * self-invocation so scripts work in development without a global install.
 */
const resolveCommand = (command: string): string => {
  if (command === "eser" || command.startsWith("eser ")) {
    const rest = command.slice("eser".length);
    return `${resolveCliPrefix()}${rest}`;
  }
  return command;
};

/**
 * Execute a shell command string, optionally in a working directory
 * and with extra arguments appended.
 *
 * Returns the process exit code.
 */
export const executeCommand = async (
  command: string,
  workingDirectory?: string,
  extraArgs?: readonly string[],
): Promise<number> => {
  const resolved = resolveCommand(command);
  const fullCommand = (extraArgs !== undefined && extraArgs.length > 0)
    ? `${resolved} ${extraArgs.join(" ")}`
    : resolved;

  const cwd = workingDirectory ?? ".";

  const builder = new shellExec.CommandBuilder("sh", ["-c", fullCommand])
    .cwd(cwd)
    .stdout("inherit")
    .stderr("inherit")
    .noThrow();

  const output = await builder.spawn();
  return output.code;
};

/**
 * Run a script by name, resolving and executing its dependencies first.
 *
 * Dependencies are executed without extra args. The main script receives
 * any remaining CLI arguments appended to its command.
 */
export const runScript = async (
  name: string,
  _config: ScriptConfig,
  scripts: Readonly<Record<string, ScriptConfig>>,
  remainingArgs: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  // Resolve dependency order
  const deps = resolveDependencies(name, scripts);

  // Execute dependencies first (no extra args)
  for (const dep of deps) {
    const depParsed = parseScript(dep, scripts[dep]!);
    console.log(fmtColors.dim(`$ ${dep}`));

    const depCode = await executeCommand(
      depParsed.command,
      depParsed.workingDirectory,
    );

    if (depCode !== 0) {
      console.error(
        fmtColors.red(
          `Script dependency "${dep}" failed with exit code ${depCode}`,
        ),
      );
      return results.fail({ exitCode: depCode });
    }
  }

  // Execute the main script
  const parsed = parseScript(name, scripts[name]!);
  console.log(fmtColors.dim(`$ ${name}`));

  const exitCode = await executeCommand(
    parsed.command,
    parsed.workingDirectory,
    remainingArgs,
  );

  if (exitCode !== 0) {
    return results.fail({ exitCode });
  }

  return results.ok(undefined);
};

/**
 * Print a formatted list of available scripts for the help display.
 */
export const showScripts = (
  scripts: Readonly<Record<string, ScriptConfig>>,
): void => {
  console.log("Scripts:");

  for (const [name, config] of Object.entries(scripts)) {
    const parsed = parseScript(name, config);
    console.log(`  ${name.padEnd(20)} ${fmtColors.dim(parsed.description)}`);
  }

  console.log();
};
