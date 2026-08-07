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
  /** Timeout in milliseconds */
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
 * Error thrown when command execution fails
 */
export class CommandError extends Error {
  readonly command: string;
  readonly code: number;
  readonly stderr: string;

  // Assigned explicitly rather than declared as constructor parameter
  // properties. Node's type stripping is erase-only, and a parameter property
  // EMITS an assignment, so `node worker.ts` fails on it with
  // ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. Writing the field out keeps the file
  // runnable by Deno, Bun and Node alike.
  constructor(
    message: string,
    command: string,
    code: number,
    stderr: string,
  ) {
    super(message);
    this.name = "CommandError";
    this.command = command;
    this.code = code;
    this.stderr = stderr;
  }
}
