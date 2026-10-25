// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Uninstall command handler - uninstalls eser CLI globally
 *
 * @module
 */

import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";
import type { CliApp } from "../app.ts";
import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import * as shellExec from "@eserstack/shell/exec";
import * as completionsSetup from "./completions-setup.ts";

type UninstallConfig = {
  readonly cmd: string;
  readonly args: readonly string[];
};

// A function of the app, not a constant: the same command uninstalls eser,
// noskills or laroux, and only the package name differs.
const uninstallConfigs = (app: CliApp): Record<string, UninstallConfig> => ({
  node: {
    cmd: "npm",
    args: ["uninstall", "-g", app.npmPackage ?? app.command],
  },
});

export const uninstallHandler = async (
  _ctx: shellArgs.CommandContext,
  app: CliApp,
): Promise<shellArgs.CliResult<void>> => {
  const runtimeName = standardsCrossRuntime.detectRuntime();

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.text("Detected runtime: "), span.cyan(runtimeName));

  const config = uninstallConfigs(app)[runtimeName];

  if (config === undefined) {
    const renderer = streams.renderers.ansi();
    await out.close();
    return results.fail({
      message:
        `${renderer.render([
          span.red(`\nUnsupported runtime: ${runtimeName}`),
        ])}\n` + "Global uninstallation is only supported for Node.js.",
      exitCode: 1,
    });
  }

  const { cmd, args } = config;

  // Remove shell completions first
  const shell = completionsSetup.detectShell();
  out.writeln(
    span.text("\nRemoving "),
    span.cyan(shell),
    span.text(" completions..."),
  );
  await completionsSetup.removeCompletions(shell, app.command);

  out.writeln(span.dim(`\nRunning: ${cmd} ${args.join(" ")}`));
  out.writeln();

  const result = await shellExec.exec`${cmd} ${args}`
    .stdout("inherit")
    .stderr("inherit")
    .noThrow()
    .spawn();

  if (!result.success) {
    out.writeln(span.red("\nUninstallation failed."));
    await out.close();
    return results.fail({ exitCode: result.code });
  }

  out.writeln(span.green("\nUninstallation complete!"));
  out.writeln(
    span.text("The "),
    span.cyan(app.command),
    span.text(" command has been removed from your system."),
  );

  await out.close();
  return results.ok(undefined);
};
