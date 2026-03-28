// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eser/shell - Shell utilities for CLI applications
 *
 * Provides submodules:
 * - `@eser/shell/completions` - Shell completion script generators (bash, zsh, fish)
 * - `@eser/shell/args` - CLI framework with command trees, lazy loading, and completions
 * - `@eser/shell/exec` - Shell command execution
 * - `@eser/shell/tui` - Terminal UI: prompts, spinners, progress bars, and output utilities
 *
 * @module
 */

export * as completions from "./completions/mod.ts";
export * as args from "./args/mod.ts";
export * as exec from "./exec/mod.ts";
export * as tui from "./tui/mod.ts";
export {
  Module,
  type ModuleConfig,
  type SubmoduleRegistration,
} from "./module.ts";
