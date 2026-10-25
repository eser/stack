// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell execution type definitions
 *
 * @module
 */

/**
 * Standard I/O options for command execution
 */
export type StdioOption = "inherit" | "piped" | "null";

/**
 * Options for command execution
 */
export type CommandOptions = {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Stdin handling */
  stdin?: StdioOption;
  /**
   * Data to write to the process's stdin, which is then closed.
   *
   * This is the way to hand a process a large payload. argv is bounded by
   * ARG_MAX on every platform, at a size real prompts and file contents reach,
   * and the failure is an opaque spawn error rather than anything naming the
   * cause.
   */
  stdinText?: string;
  /** Stdout handling */
  stdout?: StdioOption;
  /** Stderr handling */
  stderr?: StdioOption;
  /**
   * Milliseconds the command may run before it is stopped, above 0 and at most
   * 2147483647. Unset means 10 minutes for a command whose output is captured
   * and no limit for one with any "inherit" stdio. See
   * `CommandBuilder.timeout()`.
   */
  timeout?: number;
  /** Whether to throw on non-zero exit code */
  throwOnError?: boolean;
};

/**
 * Result of command execution
 */
export type CommandResult = {
  /** Exit code */
  readonly code: number;
  /** Whether command succeeded (exit code 0) */
  readonly success: boolean;
  /** Captured stdout (when piped) */
  readonly stdout: Uint8Array;
  /** Captured stderr (when piped) */
  readonly stderr: Uint8Array;
};

/**
 * Error thrown when a command ran and exited with a non-zero code, unless the
 * builder was told `noThrow()`.
 */
export class CommandError extends Error {
  /** The program that was run, without its arguments. */
  readonly command: string;
  /** The exit code the command returned. */
  readonly code: number;
  /** What the command wrote to stderr, or "" when stderr was not captured. */
  readonly stderr: string;

  // Assigned explicitly rather than declared as constructor parameter
  // properties. Node's type stripping is erase-only, and a parameter property
  // EMITS an assignment, so `node worker.ts` fails on it with
  // ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. Writing the field out keeps the file
  // runnable by Deno, Bun and Node alike.
  /**
   * Create the error for a command that exited non-zero.
   *
   * @param message - What failed, naming the command and its exit code.
   * @param command - The program that was run.
   * @param code - Its exit code.
   * @param stderr - Its captured stderr.
   */
  constructor(message: string, command: string, code: number, stderr: string) {
    super(message);
    this.name = "CommandError";
    this.command = command;
    this.code = code;
    this.stderr = stderr;
  }
}

/**
 * Error thrown when a command did not run to an exit code: it could not start
 * (the program or the working directory does not exist), or it ran past its
 * timeout and was stopped. `noThrow()` does not suppress it, since there is no
 * exit code to return. A command that ran and exited non-zero throws
 * {@link CommandError} instead.
 */
export class CommandRunError extends Error {
  /** The program that was run, without its arguments. */
  readonly command: string;

  /**
   * Create the error for a command that did not run to an exit code.
   *
   * @param message - What failed and what to change.
   * @param command - The program that was run.
   * @param options - The underlying error as `cause`, when there is one.
   */
  constructor(message: string, command: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CommandRunError";
    this.command = command;
  }
}
