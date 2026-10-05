// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eserstack/shell - Shell utilities for CLI applications
 *
 * Every submodule is reachable from this root as a namespace:
 * - `completions` - Shell completion script generators (bash, zsh, fish)
 * - `args` - CLI framework with command trees, lazy loading, and completions
 * - `exec` - Shell command execution
 * - `env` - Shell and environment detection, and executable lookup on PATH
 * - `tui` - Terminal UI: prompts, spinners, progress bars, and output utilities
 * - `vterm` - Virtual terminal emulation backed by `@xterm/headless`
 * - `goExec` - Command execution through the Go native library only
 *
 * `Module` and its configuration types are exported at the top level.
 *
 * @example
 * ```ts
 * import * as shell from "@eserstack/shell";
 *
 * const branch = await shell.exec.exec`git branch --show-current`.text();
 * const hasGit = await shell.env.hasExecutable("git");
 * ```
 *
 * @module
 */

/** Shell completion script generators for bash, zsh and fish. */
export * as completions from "./completions/mod.ts";
/** CLI framework: command trees, flags, lazy loading, help and completions. */
export * as args from "./args/mod.ts";
/** Shell command execution with a template-literal API. */
export * as exec from "./exec/mod.ts";
/** Shell and environment detection, and executable lookup on PATH. */
export * as env from "./env/mod.ts";
/** Terminal UI: prompts, spinners, progress bars, layout and widgets. */
export * as tui from "./tui/mod.ts";
/** Virtual terminal backed by `@xterm/headless`, rendered as ANSI. */
export * as vterm from "./vterm/mod.ts";
/** Command execution through the Go native library only, with no fallback. */
export * as goExec from "./go-exec.ts";
export {
  Module,
  type ModuleConfig,
  type SubmoduleRegistration,
} from "./module.ts";
