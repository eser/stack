// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell command execution with fluent API
 *
 * Provides a template tag function `exec` for building and executing shell commands
 * with a fluent API. Uses `@eser/standards/runtime` for cross-runtime compatibility.
 *
 * @example
 * ```ts
 * import { exec } from "@eser/shell/exec";
 *
 * // Basic usage
 * const output = await exec`echo hello world`.text();
 * console.log(output); // "hello world"
 *
 * // With interpolation
 * const dir = "./my-project";
 * const files = await exec`ls -la ${dir}`.lines();
 *
 * // JSON parsing
 * const pkg = await exec`cat package.json`.json<{ name: string }>();
 *
 * // With options
 * await exec`npm install`
 *   .cwd("./my-project")
 *   .env("NODE_ENV", "production")
 *   .timeout(60000)
 *   .text();
 *
 * // Error handling
 * const code = await exec`test -f missing.txt`.noThrow().code();
 * if (code !== 0) {
 *   console.log("File not found");
 * }
 *
 * // Piping (basic)
 * const result = await exec`cat file.txt`
 *   .pipe(exec`grep pattern`)
 *   .text();
 *
 * // Streaming I/O with child process
 * const child = exec`deno fmt -`.child();
 * await input.pipeTo(child.stdin!);
 * const { stdout } = await child.output();
 * ```
 *
 * @module
 */

export * from "./types.ts";
export type { ChildProcess } from "@eser/standards/runtime";
export * from "./command.ts";
export * from "./parser.ts";
export * from "./exec.ts";
