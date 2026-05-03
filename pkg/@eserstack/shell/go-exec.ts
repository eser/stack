// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Go-backed shell command execution.
 *
 * Delegates to EserAjanShellExec for fast synchronous-style subprocess
 * execution via the native Go library.
 *
 * @module
 */

import { ensureLib, getLib } from "./ffi-client.ts";

export type GoExecOptions = {
  readonly args?: string[];
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly stdin?: string;
  readonly timeout?: number;
};

export type GoExecResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
};

/**
 * Execute a shell command via the native Go library.
 *
 * @param command - Command to execute
 * @param options - Execution options
 * @returns stdout, stderr, and exit code
 * @throws Error if the native library is unavailable or the command fails.
 *
 * @example
 * ```typescript
 * import { goExec } from "@eserstack/shell/go-exec";
 *
 * const result = await goExec("git", { args: ["log", "--oneline", "-5"] });
 * console.log(result.stdout);
 * ```
 */
export const goExec = async (
  command: string,
  options: GoExecOptions = {},
): Promise<GoExecResult> => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error("native library not available for goExec");
  }

  const raw = lib.symbols.EserAjanShellExec(
    JSON.stringify({ command, ...options }),
  );
  const result = JSON.parse(raw) as GoExecResult & { error?: string };

  if (result.error) {
    throw new Error(result.error);
  }

  return { stdout: result.stdout, stderr: result.stderr, code: result.code };
};
