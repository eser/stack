// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell completion type definitions
 *
 * @module
 */

/**
 * Supported shell types for completion generation
 */
export type Shell = "bash" | "zsh" | "fish";

/**
 * A node in the completion tree representing a command or subcommand
 */
export type CompletionNode = {
  /** Command or subcommand name */
  readonly name: string;
  /** Description shown in completion hints */
  readonly description?: string;
  /** Child commands/subcommands */
  readonly children?: readonly CompletionNode[];
  /** Flag definitions for this command */
  readonly flags?: readonly CompletionFlag[];
};

/**
 * A flag definition for shell completions
 */
export type CompletionFlag = {
  /** Long flag name (e.g., "verbose") */
  readonly name: string;
  /** Short flag alias (e.g., "v") */
  readonly short?: string;
  /** Description shown in completion hints */
  readonly description?: string;
  /** Whether the flag takes an argument */
  readonly takesValue?: boolean;
};

/**
 * Generator function type for shell completions
 */
export type CompletionGenerator = (
  appName: string,
  tree: CompletionNode,
) => string;
