// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell environment detection utilities
 *
 * @module
 */

import * as stdPath from "@std/path";
import * as standardsRuntime from "@eser/standards/runtime";
import type { Shell, ShellConfig } from "./types.ts";

/**
 * Get user's home directory
 */
export const getHomeDir = (): string => {
  const { runtime } = standardsRuntime;
  return runtime.env.get("HOME") ?? "";
};

/**
 * Detect shell type from SHELL environment variable
 */
export const detectShell = (): Shell => {
  const { runtime } = standardsRuntime;
  const shellPath = runtime.env.get("SHELL") ?? "";

  if (shellPath.includes("zsh")) {
    return "zsh";
  }
  if (shellPath.includes("fish")) {
    return "fish";
  }
  return "bash";
};

/**
 * Get the RC file path for a shell
 */
export const getRcFilePath = (shell: Shell): string => {
  const home = getHomeDir();

  switch (shell) {
    case "zsh":
      return stdPath.join(home, ".zshrc");
    case "bash":
      return stdPath.join(home, ".bashrc");
    case "fish":
      return stdPath.join(home, ".config", "fish", "config.fish");
  }
};

/**
 * Get the completions file path for a shell
 * For eval-based shells (bash/zsh), returns the RC file
 * For file-based shells (fish), returns the dedicated completions file
 */
export const getCompletionsFilePath = (
  shell: Shell,
  appName: string,
): string => {
  const home = getHomeDir();

  switch (shell) {
    case "zsh":
      return stdPath.join(home, ".zshrc");
    case "bash":
      return stdPath.join(home, ".bashrc");
    case "fish":
      return stdPath.join(
        home,
        ".config",
        "fish",
        "completions",
        `${appName}.fish`,
      );
  }
};

/**
 * Get the completion line to add to RC file (for bash/zsh)
 */
export const getCompletionEvalLine = (
  shell: Shell,
  appName: string,
): string => {
  return `eval "$(${appName} system completions --shell ${shell})"`;
};

/**
 * Get the completion type for a shell
 */
export const getCompletionType = (shell: Shell): "eval" | "file" => {
  return shell === "fish" ? "file" : "eval";
};

/**
 * Get complete shell configuration
 */
export const getShellConfig = (
  shell?: Shell,
  appName = "eser",
): ShellConfig => {
  const detectedShell = shell ?? detectShell();
  const completionType = getCompletionType(detectedShell);

  return {
    shell: detectedShell,
    rcFile: getRcFilePath(detectedShell),
    completionType,
    completionsFile: completionType === "file"
      ? getCompletionsFilePath(detectedShell, appName)
      : undefined,
  };
};
