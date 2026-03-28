// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell environment type definitions
 *
 * @module
 */

/**
 * Supported shell types
 */
export type Shell = "bash" | "zsh" | "fish";

/**
 * Audience axis — who is consuming output.
 *
 * - "agent" — an AI coding agent (Claude Code, Cursor, Kiro)
 * - "human" — a terminal user or CI script
 */
export type Audience = "agent" | "human";

/**
 * Interaction axis — whether the process can show interactive prompts.
 *
 * - "interactive" — TTY attached, can show prompts/spinners
 * - "non-interactive" — piped, CI, no TTY
 */
export type Interaction = "interactive" | "non-interactive";

/**
 * Shell configuration information
 */
export type ShellConfig = {
  /** Shell type */
  readonly shell: Shell;
  /** Path to the shell's RC file (e.g., ~/.zshrc) */
  readonly rcFile: string;
  /** How completions are configured for this shell */
  readonly completionType: "eval" | "file";
  /** Path to completions file (for file-based shells like fish) */
  readonly completionsFile?: string;
};

/**
 * Complete environment configuration — shell + audience + interaction.
 */
export type EnvironmentConfig = {
  readonly shell: Shell;
  readonly audience: Audience;
  readonly interaction: Interaction;
};
