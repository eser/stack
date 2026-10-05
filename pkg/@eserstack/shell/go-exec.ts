// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Go-backed shell command execution.
 *
 * Delegates to EserAjanShellExec for fast synchronous-style subprocess
 * execution via the native Go library.
 *
 * @module
 */

import * as ffiClient from "./ffi-client.ts";
import * as execGo from "./exec/exec-go.ts";

/** Options for {@link goExec}. */
export type GoExecOptions = {
  /** Arguments, passed as argv without a shell. */
  readonly args?: string[];
  /** Working directory; the current one when unset. */
  readonly cwd?: string;
  /** Variables added to the inherited environment. */
  readonly env?: Record<string, string>;
  /** Text written to the command's stdin. */
  readonly stdin?: string;
  /**
   * Milliseconds the command may run before it is stopped: 10 minutes when
   * unset. It must be above 0 and at most 2147483647 (about 24.8 days); there
   * is no value for "no limit", and 0 throws a RangeError. A fraction is
   * rounded up.
   */
  readonly timeout?: number;
};

/** What a command run by {@link goExec} produced. */
export type GoExecResult = {
  /** Everything the command wrote to stdout. */
  readonly stdout: string;
  /** Everything the command wrote to stderr. */
  readonly stderr: string;
  /** The exit code; a non-zero code is returned here, not thrown. */
  readonly code: number;
};

/**
 * Execute a command via the native Go library.
 *
 * @param command - Command to execute
 * @param options - Execution options
 * @returns stdout, stderr, and exit code
 * @throws {Error} When the native library is unavailable.
 * @throws {RangeError} When `options.timeout` is out of range.
 * @throws {CommandRunError} When the command could not start or ran past its
 *   timeout (`CommandRunError` from `@eserstack/shell/exec`).
 *
 * @example
 * ```typescript
 * import * as shell from "@eserstack/shell";
 *
 * const result = await shell.goExec.goExec("git", {
 *   args: ["log", "--oneline", "-5"],
 *   timeout: 30_000,
 * });
 * console.log(result.stdout);
 * ```
 */
export const goExec = async (
  command: string,
  options: GoExecOptions = {},
): Promise<GoExecResult> => {
  // Built first, so an out-of-range timeout is reported as itself even where
  // the native library is missing.
  const request = execGo.buildExecGoRequest(command, options);
  const lib = await ffiClient.ensureNativeLib();

  if (lib === null) {
    throw new Error(
      `goExec ${command}: the @eserstack/ajan native library is not ` +
        `available; install the @eserstack/ajan platform package for this OS ` +
        `and architecture, or run the command through shell.exec, which falls ` +
        `back to the runtime spawn` + ffiClient.describeNativeLoadFailure(),
    );
  }

  return execGo.runExecGo(lib, request);
};
