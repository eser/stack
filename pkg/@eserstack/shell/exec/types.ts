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
  constructor(
    message: string,
    public readonly command: string,
    public readonly code: number,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}
