// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Uninstall command handler - uninstalls eser CLI globally
 *
 * @module
 */

import * as span from "@eser/streams/span";
import * as streams from "@eser/streams";
import * as standardsRuntime from "@eser/standards/runtime";
import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import * as shellExec from "@eser/shell/exec";
import { detectShell, removeCompletions } from "./completions-setup.ts";

type UninstallConfig = {
  readonly cmd: string;
  readonly args: readonly string[];
};

const UNINSTALL_CONFIGS: Record<string, UninstallConfig> = {
  deno: {
    cmd: "deno",
    args: ["uninstall", "-g", "eser"],
  },
  node: {
    cmd: "npm",
    args: ["uninstall", "-g", "eser"],
  },
  bun: {
    cmd: "bun",
    args: ["remove", "-g", "eser"],
  },
};

export const uninstallHandler = async (
  _ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const runtimeName = standardsRuntime.detectRuntime();

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.text("Detected runtime: "), span.cyan(runtimeName));

  const config = UNINSTALL_CONFIGS[runtimeName];

  if (config === undefined) {
    const renderer = streams.renderers.ansi();
    await out.close();
    return results.fail({
      message:
        `${
          renderer.render([span.red(`\nUnsupported runtime: ${runtimeName}`)])
        }\n` +
        "Global uninstallation is only supported for Deno, Node.js, and Bun.",
      exitCode: 1,
    });
  }

  const { cmd, args } = config;

  // Remove shell completions first
  const shell = detectShell();
  out.writeln(
    span.text("\nRemoving "),
    span.cyan(shell),
    span.text(" completions..."),
  );
  await removeCompletions(shell);

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
    span.cyan("eser"),
    span.text(" command has been removed from your system."),
  );

  await out.close();
  return results.ok(undefined);
};
