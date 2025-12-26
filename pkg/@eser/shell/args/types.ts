// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CLI argument parsing type definitions
 *
 * @module
 */

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
 * Handler function for command execution
 */
export type CommandHandler = (ctx: CommandContext) => void | Promise<void>;

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
