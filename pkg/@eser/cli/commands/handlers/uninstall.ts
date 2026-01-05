// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Uninstall command handler - uninstalls eser CLI globally
 *
 * @module
 */

import * as fmtColors from "@std/fmt/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import { fail, ok } from "@eser/functions/results";
import { type CliResult, type CommandContext } from "@eser/shell/args";
import { exec } from "@eser/shell/exec";
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
  _ctx: CommandContext,
): Promise<CliResult<void>> => {
  const runtimeName = standardsRuntime.detectRuntime();

  // deno-lint-ignore no-console
  console.log(`Detected runtime: ${fmtColors.cyan(runtimeName)}`);

  const config = UNINSTALL_CONFIGS[runtimeName];

  if (config === undefined) {
    return fail({
      message: `${fmtColors.red(`\nUnsupported runtime: ${runtimeName}`)}\n` +
        "Global uninstallation is only supported for Deno, Node.js, and Bun.",
      exitCode: 1,
    });
  }

  const { cmd, args } = config;

  // Remove shell completions first
  const shell = detectShell();
  // deno-lint-ignore no-console
  console.log(`\nRemoving ${fmtColors.cyan(shell)} completions...`);
  await removeCompletions(shell);

  // deno-lint-ignore no-console
  console.log(fmtColors.dim(`\nRunning: ${cmd} ${args.join(" ")}`));
  // deno-lint-ignore no-console
  console.log("");

  const result = await exec`${cmd} ${args}`
    .stdout("inherit")
    .stderr("inherit")
    .noThrow()
    .spawn();

  if (!result.success) {
    // deno-lint-ignore no-console
    console.error(fmtColors.red("\nUninstallation failed."));
    return fail({ exitCode: result.code });
  }

  // deno-lint-ignore no-console
  console.log(fmtColors.green("\nUninstallation complete!"));
  // deno-lint-ignore no-console
  console.log(
    `The ${fmtColors.cyan("eser")} command has been removed from your system.`,
  );

  return ok(undefined);
};
