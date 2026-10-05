// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell completion utilities
 *
 * Provides low-level shell completion script generators for bash, zsh, and fish.
 *
 * @example
 * ```ts
 * import * as shell from "@eserstack/shell";
 *
 * const tree: shell.completions.CompletionNode = {
 *   name: "myapp",
 *   children: [
 *     { name: "init", description: "Initialize project" },
 *     { name: "build", description: "Build project" },
 *   ],
 *   flags: [
 *     { name: "verbose", short: "v", description: "Verbose output" },
 *   ],
 * };
 *
 * const bashScript = shell.completions.generate("bash", "myapp", tree);
 * const zshScript = shell.completions.generate("zsh", "myapp", tree);
 * const fishScript = shell.completions.generate("fish", "myapp", tree);
 * ```
 *
 * @module
 */

import type { CompletionNode, Shell } from "./types.ts";
import * as bash from "./generators/bash.ts";
import * as zsh from "./generators/zsh.ts";
import * as fish from "./generators/fish.ts";

export {
  type CompletionFlag,
  type CompletionGenerator,
  type CompletionNode,
  type Shell,
} from "./types.ts";
export * as generators from "./generators/mod.ts";

/**
 * Generate a shell completion script for the given command tree
 *
 * @param shell - Target shell type (bash, zsh, or fish)
 * @param appName - Name of the CLI application
 * @param tree - Command tree structure
 * @returns Generated shell script as a string
 */
export const generate = (
  shell: Shell,
  appName: string,
  tree: CompletionNode,
): string => {
  switch (shell) {
    case "bash":
      return bash.generate(appName, tree);
    case "zsh":
      return zsh.generate(appName, tree);
    case "fish":
      return fish.generate(appName, tree);
  }
};
