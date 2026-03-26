// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CLI argument parsing type definitions
 *
 * @module
 */

import type * as results from "@eser/primitives/results";

/**
 * Supported flag value types
 */
export type FlagType = "boolean" | "string" | "number" | "string[]";

/**
 * Flag definition for a command
 */
export type FlagDef = {
  /** Long flag name (e.g., "verbose" for --verbose) */
  readonly name: string;
  /** Optional short alias (e.g., "v" for -v) */
  readonly short?: string;
  /** Description shown in help text */
  readonly description: string;
  /** Type of the flag value */
  readonly type: FlagType;
  /** Default value if not provided */
  readonly default?: unknown;
  /** Whether the flag is required */
  readonly required?: boolean;
  /** Whether this flag propagates to subcommands */
  readonly persistent?: boolean;
};

/**
 * Context passed to command handlers
 */
export type CommandContext = {
  /** Positional arguments after command/subcommand */
  readonly args: readonly string[];
  /** Parsed flags as key-value pairs */
  readonly flags: Readonly<Record<string, unknown>>;
  /** Parent context if this is a subcommand */
  readonly parent?: CommandContext;
  /** Reference to the root command */
  readonly root: CommandLike;
  /** Name of the executed command path */
  readonly commandPath: readonly string[];
};

/**
 * Handler function for command execution.
 * Returns CliResult to make success/failure explicit in the type system.
 */
export type CommandHandler = (
  ctx: CommandContext,
) => CliResult<void> | Promise<CliResult<void>>;

/**
 * Argument validation modes
 */
export type ArgsValidation =
  | "none" // Any number of args allowed
  | "no-args" // Exactly zero args required
  | "exact" // Exact count required
  | "min" // Minimum count required
  | "max" // Maximum count allowed
  | "range"; // Range of counts allowed

/**
 * Argument validation configuration
 */
export type ArgsConfig = {
  readonly validation: ArgsValidation;
  readonly count?: number;
  readonly min?: number;
  readonly max?: number;
};

/**
 * Interface for command-like objects (used for root reference)
 */
export interface CommandLike {
  readonly name: string;
  completions(shell: "bash" | "zsh" | "fish"): string;
  help(): string;
}

/**
 * CLI error type - pure data representing a CLI failure.
 *
 * Instead of throwing exceptions which break determinism, CLI functions
 * return Result<T, CliError> to make the error path explicit in the type system.
 */
export type CliError = {
  /** Error message to display */
  readonly message?: string;
  /** Exit code for the process */
  readonly exitCode: number;
};

/**
 * Result type specialized for CLI operations.
 * Success contains the value, failure contains CliError.
 *
 * @example
 * ```ts
 * import { ok, fail } from "@eser/primitives/results";
 *
 * // Success
 * return ok(undefined);
 *
 * // Failure
 * return fail({ message: "Invalid argument", exitCode: 1 });
 * ```
 */
export type CliResult<T> = results.Result<T, CliError>;

/**
 * Options for lazily-loaded subcommands.
 * The module is only imported when the command is invoked.
 */
export type LazyCommandOptions = {
  /** Description shown in help text (without loading the module) */
  readonly description: string;
  /** Async factory that loads and returns the Command */
  readonly load: () => Promise<CommandLike>;
};

/**
 * A module that can be dispatched from the CLI.
 * Used by moduleGroup for registry-style command namespaces.
 */
export type DispatchableModule = {
  readonly main: (
    cliArgs?: readonly string[],
  ) => Promise<CliResult<void>>;
};

/**
 * Entry for a single module within a module group.
 */
export type ModuleEntry = {
  readonly description: string;
  readonly category?: string;
  readonly load: () => Promise<DispatchableModule>;
  /** Flag metadata for shell completions (optional — avoids loading module) */
  readonly flags?: readonly FlagDef[];
};

/**
 * A group of lazily-loaded modules under a single namespace.
 * Used for registry-style dispatch (e.g., `eser codebase <module>`).
 */
export type ModuleGroupOptions = {
  readonly description: string;
  readonly modules: Record<string, ModuleEntry>;
  readonly aliases?: Record<string, string>;
};

/**
 * Handler for unrecognized commands (fallback/catch-all).
 */
export type FallbackHandler = (
  commandName: string,
  args: readonly string[],
) => Promise<CliResult<void>>;
