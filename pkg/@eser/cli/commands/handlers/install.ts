// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Install command handler - installs eser CLI globally
 *
 * @module
 */

import * as fmtColors from "@std/fmt/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import type { CommandContext } from "@eser/shell/args";
import { exec } from "@eser/shell/exec";
import { getShellConfig } from "@eser/shell/env";
import {
  addCompletions,
  detectShell,
  hasCompletions,
} from "./completions-setup.ts";

type InstallConfig = {
  readonly cmd: string;
  readonly args: readonly string[];
};

const INSTALL_CONFIGS: Record<string, InstallConfig> = {
  deno: {
    cmd: "deno",
    args: ["install", "-r", "-g", "-A", "--name", "eser", "jsr:@eser/cli"],
  },
  node: {
    cmd: "npm",
    args: ["install", "-g", "-f", "eser"],
  },
  bun: {
    cmd: "bun",
    args: ["install", "-g", "-f", "eser"],
  },
};

export const installHandler = async (_ctx: CommandContext): Promise<void> => {
  const { runtime } = standardsRuntime;
  const runtimeName = standardsRuntime.detectRuntime();

  // deno-lint-ignore no-console
  console.log(`Detected runtime: ${fmtColors.cyan(runtimeName)}`);

  const config = INSTALL_CONFIGS[runtimeName];

  if (config === undefined) {
    // deno-lint-ignore no-console
    console.error(
      fmtColors.red(`\nUnsupported runtime: ${runtimeName}`),
    );
    // deno-lint-ignore no-console
    console.error(
      "Global installation is only supported for Deno, Node.js, and Bun.",
    );
    runtime.process.exit(1);
    return; // Unreachable but helps TypeScript narrow the type
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
    console.log(fmtColors.green("\nInstallation complete!"));
    // deno-lint-ignore no-console
    console.log(
      `You can now use ${
        fmtColors.cyan("eser")
      } from anywhere in your terminal.`,
    );

    // Setup shell completions
    const shell = detectShell();
    const alreadyHasCompletions = await hasCompletions(shell);

    if (!alreadyHasCompletions) {
      // deno-lint-ignore no-console
      console.log(`\nSetting up ${fmtColors.cyan(shell)} completions...`);
      await addCompletions(shell);

      const shellConfig = getShellConfig(shell);
      if (shellConfig.completionType === "eval") {
        // deno-lint-ignore no-console
        console.log(
          fmtColors.dim(
            `  Restart your shell or run 'source ${shellConfig.rcFile}' to enable completions.`,
          ),
        );
      }
    }
  } else {
    // deno-lint-ignore no-console
    console.error(fmtColors.red("\nInstallation failed."));
  }

  runtime.process.exit(result.code);
};
