// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell completions setup utilities - manages shell completion configuration
 *
 * @module
 */

import * as fmtColors from "@std/fmt/colors";
import * as stdPath from "@std/path";
import * as standardsRuntime from "@eser/standards/runtime";
import {
  detectShell,
  getCompletionEvalLine,
  getShellConfig,
  type Shell,
} from "@eser/shell/env";

export { detectShell };
export type { Shell };

const COMPLETION_MARKER = "# eser CLI completions";
const APP_NAME = "eser";

/**
 * Read file contents, returns empty string if file doesn't exist
 */
const readFileOrEmpty = async (path: string): Promise<string> => {
  const { runtime } = standardsRuntime;
  try {
    return await runtime.fs.readTextFile(path);
  } catch {
    return "";
  }
};

/**
 * Check if a file exists
 */
const fileExists = async (path: string): Promise<boolean> => {
  const { runtime } = standardsRuntime;
  try {
    await runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if completions are already configured for the shell
 */
export const hasCompletions = async (shell: Shell): Promise<boolean> => {
  const config = getShellConfig(shell, APP_NAME);

  if (config.completionType === "file") {
    return await fileExists(config.completionsFile!);
  }

  const content = await readFileOrEmpty(config.rcFile);
  const line = getCompletionEvalLine(shell, APP_NAME);
  return content.includes(line);
};

/**
 * Add completions to shell configuration
 */
export const addCompletions = async (shell: Shell): Promise<void> => {
  const { runtime } = standardsRuntime;
  const config = getShellConfig(shell, APP_NAME);

  try {
    if (config.completionType === "file") {
      const fishPath = config.completionsFile!;
      const dir = stdPath.dirname(fishPath);

      try {
        await runtime.fs.mkdir(dir, { recursive: true });
      } catch {
        // Directory might already exist
      }

      const fishScript = `# eser CLI completions
# This file is auto-generated. Run 'eser system completions --shell fish' to regenerate.
complete -c eser -f
complete -c eser -n "__fish_use_subcommand" -a "codebase" -d "Codebase validation and management tools"
complete -c eser -n "__fish_use_subcommand" -a "system" -d "System management and setup tools"
complete -c eser -n "__fish_use_subcommand" -a "install" -d "Install eser CLI globally"
complete -c eser -n "__fish_use_subcommand" -a "update" -d "Update eser CLI to latest version"
complete -c eser -n "__fish_seen_subcommand_from system" -a "install" -d "Install eser CLI globally"
complete -c eser -n "__fish_seen_subcommand_from system" -a "uninstall" -d "Uninstall eser CLI globally"
complete -c eser -n "__fish_seen_subcommand_from system" -a "update" -d "Update eser CLI to latest version"
complete -c eser -n "__fish_seen_subcommand_from system" -a "completions" -d "Generate shell completion scripts"
`;
      await runtime.fs.writeTextFile(fishPath, fishScript);
      // deno-lint-ignore no-console
      console.log(`  ${fmtColors.dim("Created")} ${fmtColors.cyan(fishPath)}`);
    } else {
      const content = await readFileOrEmpty(config.rcFile);
      const line = getCompletionEvalLine(shell, APP_NAME);

      if (!content.includes(line)) {
        const addition = `\n${COMPLETION_MARKER}\n${line}\n`;
        await runtime.fs.writeTextFile(config.rcFile, content + addition);
        // deno-lint-ignore no-console
        console.log(
          `  ${fmtColors.dim("Added completions to")} ${
            fmtColors.cyan(config.rcFile)
          }`,
        );
      }
    }
  } catch (error) {
    // deno-lint-ignore no-console
    console.log(
      fmtColors.yellow(
        `  Warning: Could not add shell completions: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }
};

/**
 * Remove completions from shell configuration
 */
export const removeCompletions = async (shell: Shell): Promise<void> => {
  const { runtime } = standardsRuntime;
  const config = getShellConfig(shell, APP_NAME);

  try {
    if (config.completionType === "file") {
      const fishPath = config.completionsFile!;
      if (await fileExists(fishPath)) {
        await runtime.fs.remove(fishPath);
        // deno-lint-ignore no-console
        console.log(
          `  ${fmtColors.dim("Removed")} ${fmtColors.cyan(fishPath)}`,
        );
      }
    } else {
      const content = await readFileOrEmpty(config.rcFile);
      if (content === "") {
        return;
      }

      const line = getCompletionEvalLine(shell, APP_NAME);
      if (!content.includes(line)) {
        return;
      }

      const filtered = content
        .split("\n")
        .filter((l) => !l.includes("eser system completions"))
        .filter((l) => l !== COMPLETION_MARKER)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n");

      await runtime.fs.writeTextFile(config.rcFile, filtered);
      // deno-lint-ignore no-console
      console.log(
        `  ${fmtColors.dim("Removed completions from")} ${
          fmtColors.cyan(config.rcFile)
        }`,
      );
    }
  } catch (error) {
    // deno-lint-ignore no-console
    console.log(
      fmtColors.yellow(
        `  Warning: Could not remove shell completions: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }
};
