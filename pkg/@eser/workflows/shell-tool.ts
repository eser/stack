// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Built-in shell command tool for the workflow engine.
 *
 * Executes shell commands via subprocess. The command is passed to `sh -c`.
 *
 * **Security:** Only use with trusted config files. Never load workflow
 * config from untrusted sources when shell steps are present — the command
 * string is executed as-is with full shell interpretation.
 *
 * @example YAML
 * ```yaml
 * - shell:
 *     name: format
 *     command: deno fmt --check
 *     fixCommand: deno fmt
 * ```
 *
 * @module
 */

import * as shellExec from "@eser/shell/exec";
import type { WorkflowTool, WorkflowToolResult } from "./types.ts";

/**
 * Built-in shell tool — executes commands via `sh -c`.
 *
 * Options:
 * - `command` (string, required) — the command to execute
 * - `fixCommand` (string, optional) — command to run when `fix: true`
 * - `name` (string, optional) — display name (defaults to command)
 * - `workingDirectory` (string, optional) — working directory (relative to root)
 * - `fix` (boolean) — injected by engine, selects fixCommand if present
 * - `root` (string) — injected by engine, default working directory
 */
export const shellTool: WorkflowTool = {
  name: "shell",
  description: "Execute shell commands",

  run: async (
    options: Record<string, unknown>,
  ): Promise<WorkflowToolResult> => {
    const command = options["command"] as string | undefined;
    const fixCommand = options["fixCommand"] as string | undefined;
    const displayName = (options["name"] as string | undefined) ?? command ??
      "shell";
    const fix = (options["fix"] as boolean | undefined) ?? false;
    const root = (options["root"] as string | undefined) ?? ".";
    const workingDirectory =
      (options["workingDirectory"] as string | undefined) ?? root;

    if (command === undefined || command.length === 0) {
      throw new Error(
        "Shell tool requires a 'command' option. " +
          'Usage: { shell: { command: "deno fmt --check" } }',
      );
    }

    const cmd = (fix && fixCommand !== undefined) ? fixCommand : command;

    const builder = new shellExec.CommandBuilder("sh", ["-c", cmd]).cwd(
      workingDirectory,
    ).noThrow();
    const output = await builder.spawn();
    const exitCode = output.code;

    if (exitCode === 0) {
      return {
        name: displayName,
        passed: true,
        issues: [],
        mutations: [],
        stats: { exitCode: 0 },
      };
    }

    // Combine stdout + stderr for the failure message
    const decoder = new TextDecoder();
    const stderr = decoder.decode(output.stderr).trim();
    const stdout = decoder.decode(output.stdout).trim();
    const combinedOutput = [stdout, stderr].filter((s) => s.length > 0).join(
      "\n",
    );

    return {
      name: displayName,
      passed: false,
      issues: [{
        message: combinedOutput || `Command exited with code ${exitCode}`,
      }],
      mutations: [],
      stats: { exitCode },
    };
  },
};
