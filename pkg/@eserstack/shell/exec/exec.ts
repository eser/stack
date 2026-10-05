// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Template tag function for shell command execution
 *
 * @module
 */

import * as command from "./command.ts";
import * as parser from "./parser.ts";

/**
 * Template tag for creating shell commands
 *
 * @example
 * ```ts
 * import * as shell from "@eserstack/shell";
 *
 * // Simple command
 * const result = await shell.exec.exec`echo hello`.text();
 *
 * // With interpolation
 * const name = "world";
 * await shell.exec.exec`echo hello ${name}`.text();
 *
 * // With options
 * await shell.exec.exec`npm install`.cwd("./my-project").text();
 *
 * // Get JSON output
 * const pkg = await shell.exec.exec`cat package.json`.json<{ name: string }>();
 *
 * // Get lines
 * const files = await shell.exec.exec`ls -la`.lines();
 *
 * // Check exit code without throwing
 * const code = await shell.exec.exec`test -f file.txt`.code();
 *
 * // Streaming I/O with child process
 * const raw = ReadableStream.from([new TextEncoder().encode("const a=1")]);
 * const child = shell.exec.exec`deno fmt -`.child();
 * await raw.pipeTo(child.stdin!);
 * const { stdout } = await child.output();
 * ```
 */
export const exec = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): command.CommandBuilder => {
  const [cmd, args] = parser.parseCommand(strings, values);
  return new command.CommandBuilder(cmd, args);
};
