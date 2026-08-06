// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell environment detection utilities
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import type {
  AgentTool,
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
    // A real completions FILE, not the rc file.
    //
    // These used to return .zshrc / .bashrc -- where the eval LINE goes, not
    // where a completion script lives. Under the XDG cache dir so nothing needs
    // elevated permissions and $HOME stays clean.
    case "zsh":
      return runtime.path.join(
        home,
        ".cache",
        appName,
        "completions",
        `_${appName}`,
      );
    case "bash":
      return runtime.path.join(
        home,
        ".cache",
        appName,
        "completions",
        `${appName}.bash`,
      );
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
 * The rc-file line that loads a generated completions file.
 *
 * Sourcing a file, not eval-ing a command substitution. The eval form runs the
 * entire CLI every time a terminal opens, to produce a string that does not
 * change until the CLI is upgraded.
 */
export const getCompletionSourceLine = (
  shell: Shell,
  appName: string,
): string => {
  const file = getCompletionsFilePath(shell, appName);
  const dir = file.slice(0, file.lastIndexOf("/"));

  // zsh loads completions by scanning fpath, so it wants the DIRECTORY; bash
  // has no such mechanism and sources the file itself.
  if (shell === "zsh") {
    return `fpath=(${dir} $fpath); autoload -Uz compinit && compinit`;
  }

  return `[ -f "${file}" ] && source "${file}"`;
};

/**
 * Get the completion type for a shell
 */
export const getCompletionType = (_shell: Shell): "eval" | "file" => {
  // Always a file now.
  //
  // The eval form -- `eval "$(eser system completions --shell zsh)"` in an rc
  // file -- boots the whole CLI on every terminal open to print a static string
  // that only changes when the CLI is upgraded. Sourcing a generated file costs
  // nothing and produces identical completions.
  return "file";
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
 * Mapping from environment variables to specific agent tool IDs.
 * Checked in order — first match wins.
 */
const AGENT_ENV_MAP: readonly {
  envVars: readonly string[];
  tool: NonNullable<AgentTool>;
}[] = [
  {
    envVars: [
      "CLAUDE_CODE",
      "CLAUDECODE",
      "CLAUDE_CODE_ENTRYPOINT",
      "CLAUDE_SESSION_ID",
    ],
    tool: "claude-code",
  },
  { envVars: ["CURSOR_SESSION", "CURSOR"], tool: "cursor" },
  { envVars: ["KIRO_SESSION", "KIRO"], tool: "kiro" },
  { envVars: ["WINDSURF_SESSION"], tool: "windsurf" },
  { envVars: ["GITHUB_COPILOT"], tool: "copilot" },
];

/**
 * Detect which specific AI coding agent is running, if any.
 * Returns the tool ID or null if not inside an agent.
 */
export const detectAgentTool = (): AgentTool => {
  for (const entry of AGENT_ENV_MAP) {
    for (const varName of entry.envVars) {
      const value = runtime.env.get(varName);

      if (value !== undefined && value !== "") {
        return entry.tool;
      }
    }
  }

  return null;
};

/**
 * Detect audience — "agent" if running inside an AI coding tool, "human" otherwise.
 */
export const detectAudience = (): Audience => {
  return detectAgentTool() !== null ? "agent" : "human";
};

/**
 * Detect interaction mode — "interactive" if stdin is a TTY, "non-interactive" otherwise.
 */
export const detectInteraction = (): Interaction => {
  try {
    if (runtime.capabilities.stdin && runtime.process.isTerminal("stdin")) {
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
  agentTool: detectAgentTool(),
});
