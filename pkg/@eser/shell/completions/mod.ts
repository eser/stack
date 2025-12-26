// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell completion utilities
 *
 * Provides low-level shell completion script generators for bash, zsh, and fish.
 *
 * @example
 * ```ts
 * import { generate, type CompletionNode } from "@eser/shell/completions";
 *
 * const tree: CompletionNode = {
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
 * const bashScript = generate("bash", "myapp", tree);
 * const zshScript = generate("zsh", "myapp", tree);
 * const fishScript = generate("fish", "myapp", tree);
 * ```
 *
 * @module
 */

export * from "./types.ts";
export * as generators from "./generators/mod.ts";

import type { CompletionNode, Shell } from "./types.ts";
import { generate as generateBash } from "./generators/bash.ts";
import { generate as generateZsh } from "./generators/zsh.ts";
import { generate as generateFish } from "./generators/fish.ts";

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
      return generateBash(appName, tree);
    case "zsh":
      return generateZsh(appName, tree);
    case "fish":
      return generateFish(appName, tree);
  }
};
