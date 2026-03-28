// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell environment detection utilities
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";
import type {
  Audience,
  EnvironmentConfig,
  Interaction,
  Shell,
  ShellConfig,
} from "./types.ts";

/**
 * Get user's home directory
 */
export const getHomeDir = (): string => {
  return runtime.env.get("HOME") ?? "";
};

/**
 * Detect shell type from SHELL environment variable
 */
export const detectShell = (): Shell => {
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
      return runtime.path.join(home, ".zshrc");
    case "bash":
      return runtime.path.join(home, ".bashrc");
    case "fish":
      return runtime.path.join(home, ".config", "fish", "config.fish");
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
      return runtime.path.join(home, ".zshrc");
    case "bash":
      return runtime.path.join(home, ".bashrc");
    case "fish":
      return runtime.path.join(
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

// =============================================================================
// Two-axis environment detection
// =============================================================================

/**
 * Known environment variables set by AI coding agents.
 *
 * Claude Code: CLAUDE_CODE=1, CLAUDE_CODE_ENTRYPOINT, CLAUDE_SESSION_ID
 * Cursor:      CURSOR_SESSION, CURSOR=1
 * Kiro:        KIRO_SESSION, KIRO=1
 * Windsurf:    WINDSURF_SESSION
 * Copilot:     GITHUB_COPILOT=1
 */
const AGENT_ENV_VARS: readonly string[] = [
  "CLAUDE_CODE",
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_SESSION_ID",
  "CURSOR_SESSION",
  "CURSOR",
  "KIRO_SESSION",
  "KIRO",
  "WINDSURF_SESSION",
  "GITHUB_COPILOT",
];

/**
 * Detect audience — "agent" if running inside an AI coding tool, "human" otherwise.
 *
 * Checks well-known environment variables set by Claude Code, Cursor, Kiro,
 * Windsurf, and GitHub Copilot.
 */
export const detectAudience = (): Audience => {
  for (const varName of AGENT_ENV_VARS) {
    const value = runtime.env.get(varName);

    if (value !== undefined && value !== "") {
      return "agent";
    }
  }

  return "human";
};

/**
 * Detect interaction mode — "interactive" if stdin is a TTY, "non-interactive" otherwise.
 */
export const detectInteraction = (): Interaction => {
  try {
    if (typeof globalThis.Deno !== "undefined" && Deno.stdin.isTerminal()) {
      return "interactive";
    }

    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { stdin?: { isTTY?: boolean } }
      | undefined;

    if (proc?.stdin?.isTTY === true) {
      return "interactive";
    }
  } catch {
    // Can't determine — assume non-interactive (safe default)
  }

  return "non-interactive";
};

/**
 * Get complete environment configuration — shell + audience + interaction.
 */
export const getEnvironmentConfig = (): EnvironmentConfig => ({
  shell: detectShell(),
  audience: detectAudience(),
  interaction: detectInteraction(),
});
