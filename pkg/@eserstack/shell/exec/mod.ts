// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell command execution with fluent API
 *
 * Provides a template tag function `exec` for building and executing shell commands
 * with a fluent API. Uses `@eserstack/standards/cross-runtime` for cross-runtime compatibility.
 *
 * @example
 * ```ts
 * import * as shell from "@eserstack/shell";
 *
 * // Basic usage
 * const output = await shell.exec.exec`echo hello world`.text();
 * console.log(output); // "hello world"
 *
 * // With interpolation
 * const dir = "./my-project";
 * const files = await shell.exec.exec`ls -la ${dir}`.lines();
 *
 * // JSON parsing
 * const pkg = await shell.exec.exec`cat package.json`.json<{ name: string }>();
 *
 * // With options; without timeout() a captured command stops after 10 minutes
 * await shell.exec.exec`npm install`
 *   .cwd("./my-project")
 *   .env("NODE_ENV", "production")
 *   .timeout(60_000)
 *   .text();
 *
 * // Error handling
 * const code = await shell.exec.exec`test -f missing.txt`.noThrow().code();
 * if (code !== 0) {
 *   console.log("File not found");
 * }
 *
 * // Streaming I/O with child process
 * const input = ReadableStream.from([new TextEncoder().encode("const a=1")]);
 * const child = shell.exec.exec`deno fmt -`.child();
 * await input.pipeTo(child.stdin!);
 * const { stdout } = await child.output();
 * ```
 *
 * @module
 */

export {
  CommandError,
  type CommandOptions,
  type CommandResult,
  CommandRunError,
  type StdioOption,
} from "./types.ts";
// ProcessOutput and ProcessStatus are what ChildProcess.output() and .status
// resolve to, so they are part of the same surface.
export type {
  ChildProcess,
  ProcessOutput,
  ProcessStatus,
} from "@eserstack/standards/cross-runtime";
export { CommandBuilder } from "./command.ts";
export { parseCommand } from "./parser.ts";
export { exec } from "./exec.ts";

// PTY and process management
export { type PtyOptions, type PtyProcess, spawnPty } from "./pty.ts";
export { type ManagedProcess, ProcessGroup } from "./process-group.ts";

// FFI-backed child process (Go side)
export {
  spawnChildGo,
  spawnChildGoSync,
  type SpawnGoOptions,
} from "./child-go.ts";
