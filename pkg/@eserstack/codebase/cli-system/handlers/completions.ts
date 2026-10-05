// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Completions command handler - generates shell completion scripts
 *
 * @module
 */

import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import type { CliApp } from "../app.ts";
import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import * as shellEnv from "@eserstack/shell/env";

const getInstallInstructions = (
  shell: shellEnv.Shell,
  appName: string,
): string => {
  const config = shellEnv.getShellConfig(shell, appName);
  const renderer = streams.renderers.ansi();

  // Every shell gets a generated file now, so the instructions are the same
  // shape for all of them: write it once, then load it. fish discovers its
  // completions directory automatically and needs no rc line; zsh and bash need
  // one, but it SOURCES a file rather than eval-ing a command substitution --
  // the latter booted the CLI on every terminal open.
  const dir = config.completionsFile !== undefined
    ? config.completionsFile.slice(0, config.completionsFile.lastIndexOf("/"))
    : "";

  const write =
    `mkdir -p ${dir} && ${appName} system completions --shell ${shell} > ${config.completionsFile}`;

  if (shell === "fish") {
    return `
To install, run:

  ${renderer.render([span.dim(write)])}
`;
  }

  const sourceLine = shellEnv.getCompletionSourceLine(shell, appName);

  return `
To install, run:

  ${renderer.render([span.dim(write)])}

Then add the following to your ${renderer.render([span.cyan(config.rcFile)])}:

  ${renderer.render([span.dim(sourceLine)])}
`;
};

export const completionsHandler = (
  ctx: shellArgs.CommandContext,
  app: CliApp,
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
    // Plain text written synchronously, like the script below: this handler
    // is synchronous and never flushes the ANSI output above.
    // deno-lint-ignore no-console
    console.log(getInstallInstructions(shell, app.command));
    out.writeln(span.dim("--- Completion script ---\n"));
  }

  // The script must reach stdout unrendered and before the handler returns,
  // so `eval "$(... completions)"` and redirects to a file get it intact.
  // deno-lint-ignore no-console
  console.log(script);

  return results.ok(undefined);
};
