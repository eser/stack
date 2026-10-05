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

import * as shellExec from "@eserstack/shell/exec";
import { runtime } from "@eserstack/standards/cross-runtime";
import type {
  WorkflowTool,
  WorkflowToolContext,
  WorkflowToolResult,
} from "./types.ts";

/**
 * Built-in shell tool — executes commands via `sh -c`.
 *
 * Options:
 * - `command` (string, required) — the command to execute
 * - `fixCommand` (string, optional) — command to run when `fix: true`
 * - `name` (string, optional) — display name (defaults to command)
 * - `workingDirectory` (string, optional) — working directory (relative to root)
 * - `fix` (boolean) — injected by engine, selects fixCommand if present
 * - `dryRun` (boolean): injected by engine; a dry run never runs fixCommand,
 *   since it writes files, and runs `command` instead
 * - `root` (string) — injected by engine, default working directory
 *
 * The command is stopped when it runs past the step's timeout
 * (`context.timeoutMs`).
 */
export const shellTool: WorkflowTool = {
  name: "shell",
  description: "Execute shell commands",

  run: async (
    options: Record<string, unknown>,
    context: WorkflowToolContext,
  ): Promise<WorkflowToolResult> => {
    const command = options["command"] as string | undefined;
    const fixCommand = options["fixCommand"] as string | undefined;
    const displayName = (options["name"] as string | undefined) ?? command ??
      "shell";
    const fix = (options["fix"] as boolean | undefined) ?? false;
    const dryRun = (options["dryRun"] as boolean | undefined) ?? false;
    const root = (options["root"] as string | undefined) ?? ".";
    const workingDirectory = options["workingDirectory"] as string | undefined;

    if (command === undefined || command.length === 0) {
      throw new Error(
        "Shell tool requires a 'command' option. " +
          'Usage: { shell: { command: "deno fmt --check" } }',
      );
    }

    const cmd = fix && !dryRun && fixCommand !== undefined
      ? fixCommand
      : command;

    // Stopped at the step's timeout, so the command does not run on after the
    // engine has failed the step. spawn() then throws CommandRunError, which
    // the engine reports as the step's timeout.
    const output = await new shellExec.CommandBuilder("sh", ["-c", cmd])
      .cwd(
        workingDirectory !== undefined
          ? runtime.path.resolve(root, workingDirectory)
          : root,
      )
      .timeout(context.timeoutMs)
      .noThrow()
      .spawn();
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
        message: combinedOutput.length > 0
          ? combinedOutput
          : `Command exited with code ${exitCode}`,
      }],
      mutations: [],
      stats: { exitCode },
    };
  },
};
