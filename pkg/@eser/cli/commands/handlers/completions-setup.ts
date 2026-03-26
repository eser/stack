// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shell completions setup utilities - manages shell completion configuration
 *
 * @module
 */

import * as span from "@eser/streams/span";
import * as streams from "@eser/streams";
import { current } from "@eser/standards/runtime";
import * as shellEnv from "@eser/shell/env";

export { detectShell, type Shell } from "@eser/shell/env";

const COMPLETION_MARKER = "# eser CLI completions";
const APP_NAME = "eser";

/**
 * Read file contents, returns empty string if file doesn't exist
 */
const readFileOrEmpty = async (path: string): Promise<string> => {
  try {
    return await current.fs.readTextFile(path);
  } catch {
    return "";
  }
};

/**
 * Check if a file exists
 */
const fileExists = async (path: string): Promise<boolean> => {
  try {
    await current.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if completions are already configured for the shell
 */
export const hasCompletions = async (
  shell: shellEnv.Shell,
): Promise<boolean> => {
  const config = shellEnv.getShellConfig(shell, APP_NAME);

  if (config.completionType === "file") {
    return await fileExists(config.completionsFile!);
  }

  const content = await readFileOrEmpty(config.rcFile);
  const line = shellEnv.getCompletionEvalLine(shell, APP_NAME);
  return content.includes(line);
};

/**
 * Add completions to shell configuration
 */
export const addCompletions = async (shell: shellEnv.Shell): Promise<void> => {
  const config = shellEnv.getShellConfig(shell, APP_NAME);

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  try {
    if (config.completionType === "file") {
      const fishPath = config.completionsFile!;
      const dir = current.path.dirname(fishPath);

      try {
        await current.fs.mkdir(dir, { recursive: true });
      } catch {
        // Directory might already exist
      }

      const fishScript = `# eser CLI completions
# This file is auto-generated. Run 'eser system completions --shell fish' to regenerate.
complete -c eser -f
complete -c eser -n "__fish_use_subcommand" -a "codebase" -d "Codebase management tools"
complete -c eser -n "__fish_use_subcommand" -a "system" -d "Commands related with this CLI"
complete -c eser -n "__fish_use_subcommand" -a "install" -d "Install eser CLI globally"
complete -c eser -n "__fish_use_subcommand" -a "update" -d "Update eser CLI to latest version"
complete -c eser -n "__fish_seen_subcommand_from system" -a "install" -d "Install eser CLI globally"
complete -c eser -n "__fish_seen_subcommand_from system" -a "uninstall" -d "Uninstall eser CLI globally"
complete -c eser -n "__fish_seen_subcommand_from system" -a "update" -d "Update eser CLI to latest version"
complete -c eser -n "__fish_seen_subcommand_from system" -a "completions" -d "Generate shell completion scripts"
`;
      await current.fs.writeTextFile(fishPath, fishScript);
      out.writeln(
        span.text("  "),
        span.dim("Created"),
        span.text(" "),
        span.cyan(fishPath),
      );
    } else {
      const content = await readFileOrEmpty(config.rcFile);
      const line = shellEnv.getCompletionEvalLine(shell, APP_NAME);

      if (!content.includes(line)) {
        const addition = `\n${COMPLETION_MARKER}\n${line}\n`;
        await current.fs.writeTextFile(config.rcFile, content + addition);
        out.writeln(
          span.text("  "),
          span.dim("Added completions to"),
          span.text(" "),
          span.cyan(config.rcFile),
        );
      }
    }
  } catch (error) {
    out.writeln(
      span.yellow(
        `  Warning: Could not add shell completions: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }

  await out.close();
};

/**
 * Remove completions from shell configuration
 */
export const removeCompletions = async (
  shell: shellEnv.Shell,
): Promise<void> => {
  const config = shellEnv.getShellConfig(shell, APP_NAME);

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  try {
    if (config.completionType === "file") {
      const fishPath = config.completionsFile!;
      if (await fileExists(fishPath)) {
        await current.fs.remove(fishPath);
        out.writeln(
          span.text("  "),
          span.dim("Removed"),
          span.text(" "),
          span.cyan(fishPath),
        );
      }
    } else {
      const content = await readFileOrEmpty(config.rcFile);
      if (content === "") {
        await out.close();
        return;
      }

      const line = shellEnv.getCompletionEvalLine(shell, APP_NAME);
      if (!content.includes(line)) {
        await out.close();
        return;
      }

      const filtered = content
        .split("\n")
        .filter((l) => !l.includes("eser system completions"))
        .filter((l) => l !== COMPLETION_MARKER)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n");

      await current.fs.writeTextFile(config.rcFile, filtered);
      out.writeln(
        span.text("  "),
        span.dim("Removed completions from"),
        span.text(" "),
        span.cyan(config.rcFile),
      );
    }
  } catch (error) {
    out.writeln(
      span.yellow(
        `  Warning: Could not remove shell completions: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }

  await out.close();
};
