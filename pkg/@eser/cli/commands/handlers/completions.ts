// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Completions command handler - generates shell completion scripts
 *
 * @module
 */

import * as fmtColors from "@std/fmt/colors";
import { fail, ok } from "@eser/functions/results";
import { type CliResult, type CommandContext } from "@eser/shell/args";
import {
  detectShell,
  getCompletionEvalLine,
  getShellConfig,
  type Shell,
} from "@eser/shell/env";

const getInstallInstructions = (shell: Shell): string => {
  const config = getShellConfig(shell, "eser");

  if (config.completionType === "file") {
    return `
To install, run:

  ${
      fmtColors.dim(
        `eser system completions --shell fish > ${config.completionsFile}`,
      )
    }
`;
  }

  const evalLine = getCompletionEvalLine(shell, "eser");
  return `
To install, add the following to your ${fmtColors.cyan(config.rcFile)}:

  ${fmtColors.dim(evalLine)}
`;
};

export const completionsHandler = (ctx: CommandContext): CliResult<void> => {
  const shellFlag = ctx.flags["shell"] as string | undefined;

  let shell: Shell;
  if (shellFlag !== undefined) {
    if (!["bash", "zsh", "fish"].includes(shellFlag)) {
      return fail({
        message: `${fmtColors.red(`Invalid shell: ${shellFlag}`)}\n` +
          "Supported shells: bash, zsh, fish",
        exitCode: 1,
      });
    }
    shell = shellFlag as Shell;
  } else {
    shell = detectShell();
  }

  // Get the root command and generate completions from its tree
  const rootCommand = ctx.root;
  const script = rootCommand.completions(shell);

  // If shell was auto-detected, show instructions
  if (shellFlag === undefined) {
    // deno-lint-ignore no-console
    console.log(`Generating ${fmtColors.cyan(shell)} completions...`);
    // deno-lint-ignore no-console
    console.log(getInstallInstructions(shell));
    // deno-lint-ignore no-console
    console.log(fmtColors.dim("--- Completion script ---\n"));
  }

  // deno-lint-ignore no-console
  console.log(script);

  return ok(undefined);
};
