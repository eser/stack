// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell environment detection and configuration
 *
 * Provides utilities for detecting the user's shell and getting configuration
 * paths for shell customization (RC files, completions, etc.)
 *
 * @example
 * ```typescript
 * import { detectShell, getShellConfig } from "@eser/shell/env";
 *
 * const shell = detectShell(); // "zsh" | "bash" | "fish"
 * const config = getShellConfig(shell, "myapp");
 * console.log(config.rcFile); // "/home/user/.zshrc"
 * ```
 *
 * @module
 */

export type { Shell, ShellConfig } from "./types.ts";
export {
  detectShell,
  getCompletionEvalLine,
  getCompletionsFilePath,
  getCompletionType,
  getHomeDir,
  getRcFilePath,
  getShellConfig,
} from "./detector.ts";
