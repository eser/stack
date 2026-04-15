// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Completions command handler - generates shell completion scripts
 *
 * @module
 */

import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as results from "@eserstack/primitives/results";
import * as shellArgs from "@eserstack/shell/args";
import * as shellEnv from "@eserstack/shell/env";

const getInstallInstructions = (shell: shellEnv.Shell): string => {
  const config = shellEnv.getShellConfig(shell, "eser");
  const renderer = streams.renderers.ansi();

  if (config.completionType === "file") {
    return `
To install, run:

  ${
      renderer.render([
        span.dim(
          `eser system completions --shell fish > ${config.completionsFile}`,
        ),
      ])
    }
`;
  }

  const evalLine = shellEnv.getCompletionEvalLine(shell, "eser");
  return `
To install, add the following to your ${
    renderer.render([span.cyan(config.rcFile)])
  }:

  ${renderer.render([span.dim(evalLine)])}
`;
};

export const completionsHandler = (
  ctx: shellArgs.CommandContext,
): shellArgs.CliResult<void> => {
  const shellFlag = ctx.flags["shell"] as string | undefined;
  const renderer = streams.renderers.ansi();

  const out = streams.output({
    renderer,
    sink: streams.sinks.stdout(),
  });

  let shell: shellEnv.Shell;
  if (shellFlag !== undefined) {
    if (!["bash", "zsh", "fish"].includes(shellFlag)) {
      return results.fail({
        message:
          `${renderer.render([span.red(`Invalid shell: ${shellFlag}`)])}\n` +
          "Supported shells: bash, zsh, fish",
        exitCode: 1,
      });
    }
    shell = shellFlag as shellEnv.Shell;
  } else {
    shell = shellEnv.detectShell();
  }

  // Get the root command and generate completions from its tree
  const rootCommand = ctx.root;
  const script = rootCommand.completions(shell);

  // If shell was auto-detected, show instructions
  if (shellFlag === undefined) {
    out.writeln(
      span.text("Generating "),
      span.cyan(shell),
      span.text(" completions..."),
    );
    // deno-lint-ignore no-console
    console.log(getInstallInstructions(shell));
    out.writeln(span.dim("--- Completion script ---\n"));
  }

  // deno-lint-ignore no-console
  console.log(script);

  return results.ok(undefined);
};
