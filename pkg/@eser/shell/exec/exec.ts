// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Template tag function for shell command execution
 *
 * @module
 */

import { CommandBuilder } from "./command.ts";
import { parseCommand } from "./parser.ts";

/**
 * Template tag for creating shell commands
 *
 * @example
 * ```ts
 * import { exec } from "@eser/shell/exec";
 *
 * // Simple command
 * const result = await exec`echo hello`.text();
 *
 * // With interpolation
 * const name = "world";
 * await exec`echo hello ${name}`.text();
 *
 * // With options
 * await exec`npm install`.cwd("./my-project").text();
 *
 * // Get JSON output
 * const pkg = await exec`cat package.json`.json<{ name: string }>();
 *
 * // Get lines
 * const files = await exec`ls -la`.lines();
 *
 * // Check exit code without throwing
 * const code = await exec`test -f file.txt`.code();
 *
 * // Streaming I/O with child process
 * const child = exec`deno fmt -`.child();
 * await raw.pipeTo(child.stdin!);
 * const { stdout } = await child.output();
 * ```
 */
export const exec = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): CommandBuilder => {
  const [cmd, args] = parseCommand(strings, values);
  return new CommandBuilder(cmd, args);
};
