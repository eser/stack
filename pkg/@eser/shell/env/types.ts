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
