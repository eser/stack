// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Install command handler — installs eser CLI globally.
 *
 * For compiled binaries: copies self to ~/.local/bin or /usr/local/bin + sets up completions.
 * For runtime installs: runs the appropriate package manager install command.
 *
 * @module
 */

import * as fmtColors from "@eser/shell/formatting/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import * as shellExec from "@eser/shell/exec";
import * as shellEnv from "@eser/shell/env";
import {
  addCompletions,
  detectShell,
  hasCompletions,
} from "./completions-setup.ts";

const ESER_OPTS: standardsRuntime.CliCommandOptions = {
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eser/cli",
};

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

/**
 * Determines the best install directory for a compiled binary.
 * Prefers ~/.local/bin if it exists; falls back to /usr/local/bin.
 */
const getInstallDir = async (): Promise<string> => {
  const rt = standardsRuntime.current;
  const home = standardsRuntime.getHomedir();
  const localBin = rt.path.join(home, ".local", "bin");

  try {
    await rt.fs.stat(localBin);
    return localBin;
  } catch {
    // Fall through to /usr/local/bin
  }

  return "/usr/local/bin";
};

/**
 * Installs a compiled binary by copying itself to the install directory.
 */
const installCompiledBinary = async (): Promise<shellArgs.CliResult<void>> => {
  const rt = standardsRuntime.current;
  const currentPath = rt.process.execPath();
  const installDir = await getInstallDir();
  const targetPath = rt.path.join(installDir, "eser");

  // deno-lint-ignore no-console
  console.log(
    `Install method: ${fmtColors.cyan("compiled binary")}`,
  );
  // deno-lint-ignore no-console
  console.log(fmtColors.dim(`Copying to ${targetPath}...`));

  try {
    await rt.fs.copyFile(currentPath, targetPath);
    await rt.fs.chmod(targetPath, 0o755);
  } catch (error) {
    if (error instanceof Deno.errors.PermissionDenied) {
      // deno-lint-ignore no-console
      console.error(
        fmtColors.red(
          `\nPermission denied writing to ${installDir}.\nTry: sudo eser install`,
        ),
      );
      return results.fail({ exitCode: 1 });
    }
    throw error;
  }

  // deno-lint-ignore no-console
  console.log(fmtColors.green("\nInstallation complete!"));
  // deno-lint-ignore no-console
  console.log(
    `You can now use ${fmtColors.cyan("eser")} from anywhere in your terminal.`,
  );

  // Setup shell completions
  const shell = detectShell();
  const alreadyHasCompletions = await hasCompletions(shell);

  if (!alreadyHasCompletions) {
    // deno-lint-ignore no-console
    console.log(`\nSetting up ${fmtColors.cyan(shell)} completions...`);
    await addCompletions(shell);

    const shellConfig = shellEnv.getShellConfig(shell);
    if (shellConfig.completionType === "eval") {
      // deno-lint-ignore no-console
      console.log(
        fmtColors.dim(
          `  Restart your shell or run 'source ${shellConfig.rcFile}' to enable completions.`,
        ),
      );
    }
  }

  return results.ok(undefined);
};

export const installHandler = async (
  _ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const execContext = await standardsRuntime.detectExecutionContext(ESER_OPTS);

  // Compiled binary: copy self to install directory
  if (execContext.invoker === "binary") {
    return await installCompiledBinary();
  }

  // Runtime-based: use package manager
  // deno-lint-ignore no-console
  console.log(`Detected runtime: ${fmtColors.cyan(execContext.runtime)}`);

  const config = INSTALL_CONFIGS[execContext.runtime as string] ??
    INSTALL_CONFIGS["node"]!;

  const { cmd, args } = config;

  // deno-lint-ignore no-console
  console.log(fmtColors.dim(`Running: ${cmd} ${args.join(" ")}`));
  // deno-lint-ignore no-console
  console.log("");

  const result = await shellExec.exec`${cmd} ${args}`
    .stdout("inherit")
    .stderr("inherit")
    .noThrow()
    .spawn();

  if (!result.success) {
    // deno-lint-ignore no-console
    console.error(fmtColors.red("\nInstallation failed."));
    return results.fail({ exitCode: result.code });
  }

  // deno-lint-ignore no-console
  console.log(fmtColors.green("\nInstallation complete!"));
  // deno-lint-ignore no-console
  console.log(
    `You can now use ${fmtColors.cyan("eser")} from anywhere in your terminal.`,
  );

  // Setup shell completions
  const shell = detectShell();
  const alreadyHasCompletions = await hasCompletions(shell);

  if (!alreadyHasCompletions) {
    // deno-lint-ignore no-console
    console.log(`\nSetting up ${fmtColors.cyan(shell)} completions...`);
    await addCompletions(shell);

    const shellConfig = shellEnv.getShellConfig(shell);
    if (shellConfig.completionType === "eval") {
      // deno-lint-ignore no-console
      console.log(
        fmtColors.dim(
          `  Restart your shell or run 'source ${shellConfig.rcFile}' to enable completions.`,
        ),
      );
    }
  }

  return results.ok(undefined);
};
