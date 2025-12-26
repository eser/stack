// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Update command handler - updates eser CLI to the latest version
 *
 * @module
 */

import * as fmtColors from "@std/fmt/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import type { CommandContext } from "@eser/shell/args";
import { exec } from "@eser/shell/exec";

type UpdateConfig = {
  readonly cmd: string;
  readonly args: readonly string[];
};

const UPDATE_CONFIGS: Record<string, UpdateConfig> = {
  deno: {
    cmd: "deno",
    // Deno doesn't have an update command, so we reinstall with -r (reload) and -f (force)
    args: [
      "install",
      "-r",
      "-g",
      "-A",
      "-f",
      "--name",
      "eser",
      "jsr:@eser/cli",
    ],
  },
  node: {
    cmd: "npm",
    args: ["update", "-g", "-f", "eser"],
  },
  bun: {
    cmd: "bun",
    args: ["update", "-g", "-f", "eser"],
  },
};

export const updateHandler = async (_ctx: CommandContext): Promise<void> => {
  const { runtime } = standardsRuntime;
  const runtimeName = standardsRuntime.detectRuntime();

  // deno-lint-ignore no-console
  console.log(`Detected runtime: ${fmtColors.cyan(runtimeName)}`);

  const config = UPDATE_CONFIGS[runtimeName];

  if (config === undefined) {
    // deno-lint-ignore no-console
    console.error(
      fmtColors.red(`\nUnsupported runtime: ${runtimeName}`),
    );
    // deno-lint-ignore no-console
    console.error(
      "Global update is only supported for Deno, Node.js, and Bun.",
    );
    runtime.process.exit(1);
    return;
  }

  const { cmd, args } = config;

  // deno-lint-ignore no-console
  console.log(
    fmtColors.dim(`Running: ${cmd} ${args.join(" ")}`),
  );
  // deno-lint-ignore no-console
  console.log("");

  const result = await exec`${cmd} ${args}`
    .stdout("inherit")
    .stderr("inherit")
    .noThrow()
    .spawn();

  if (result.success) {
    // deno-lint-ignore no-console
    console.log(fmtColors.green("\nUpdate complete!"));
    // deno-lint-ignore no-console
    console.log(
      `The ${
        fmtColors.cyan("eser")
      } command has been updated to the latest version.`,
    );
  } else {
    // deno-lint-ignore no-console
    console.error(fmtColors.red("\nUpdate failed."));
  }

  runtime.process.exit(result.code);
};
