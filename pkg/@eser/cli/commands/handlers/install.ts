// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Install command handler — installs eser CLI globally.
 *
 * For compiled binaries: copies self to ~/.local/bin or /usr/local/bin + sets up completions.
 * For runtime installs: runs the appropriate package manager install command.
 *
 * @module
 */

import * as span from "@eser/streams/span";
import * as streams from "@eser/streams";
import * as standardsCrossRuntime from "@eser/standards/cross-runtime";
import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import * as shellExec from "@eser/shell/exec";
import * as shellEnv from "@eser/shell/env";
import {
  addCompletions,
  detectShell,
  hasCompletions,
} from "./completions-setup.ts";

const runtime = standardsCrossRuntime.runtime;

const ESER_OPTS: standardsCrossRuntime.CliCommandOptions = {
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
  const home = standardsCrossRuntime.getHomedir();
  const localBin = runtime.path.join(home, ".local", "bin");

  try {
    await runtime.fs.stat(localBin);
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
  const currentPath = runtime.process.execPath();
  const installDir = await getInstallDir();
  const targetPath = runtime.path.join(installDir, "eser");

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(
    span.text("Install method: "),
    span.cyan("compiled binary"),
  );
  out.writeln(span.dim(`Copying to ${targetPath}...`));

  try {
    await runtime.fs.copyFile(currentPath, targetPath);
    await runtime.fs.chmod(targetPath, 0o755);
  } catch (error) {
    if (error instanceof Deno.errors.PermissionDenied) {
      out.writeln(
        span.red(
          `\nPermission denied writing to ${installDir}.\nTry: sudo eser install`,
        ),
      );
      await out.close();
      return results.fail({ exitCode: 1 });
    }
    await out.close();
    throw error;
  }

  out.writeln(span.green("\nInstallation complete!"));
  out.writeln(
    span.text("You can now use "),
    span.cyan("eser"),
    span.text(" from anywhere in your terminal."),
  );

  // Setup shell completions
  const shell = detectShell();
  const alreadyHasCompletions = await hasCompletions(shell);

  if (!alreadyHasCompletions) {
    out.writeln(
      span.text("\nSetting up "),
      span.cyan(shell),
      span.text(" completions..."),
    );
    await addCompletions(shell);

    const shellConfig = shellEnv.getShellConfig(shell);
    if (shellConfig.completionType === "eval") {
      out.writeln(
        span.dim(
          `  Restart your shell or run 'source ${shellConfig.rcFile}' to enable completions.`,
        ),
      );
    }
  }

  await out.close();
  return results.ok(undefined);
};

export const installHandler = async (
  _ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const execContext = await standardsCrossRuntime.detectExecutionContext(
    ESER_OPTS,
  );

  // Compiled binary: copy self to install directory
  if (execContext.invoker === "binary") {
    return await installCompiledBinary();
  }

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  // Runtime-based: use package manager
  out.writeln(span.text("Detected runtime: "), span.cyan(execContext.runtime));

  const config = INSTALL_CONFIGS[execContext.runtime as string] ??
    INSTALL_CONFIGS["node"]!;

  const { cmd, args } = config;

  out.writeln(span.dim(`Running: ${cmd} ${args.join(" ")}`));
  out.writeln();

  const result = await shellExec.exec`${cmd} ${args}`
    .stdout("inherit")
    .stderr("inherit")
    .noThrow()
    .spawn();

  if (!result.success) {
    out.writeln(span.red("\nInstallation failed."));
    await out.close();
    return results.fail({ exitCode: result.code });
  }

  out.writeln(span.green("\nInstallation complete!"));
  out.writeln(
    span.text("You can now use "),
    span.cyan("eser"),
    span.text(" from anywhere in your terminal."),
  );

  // Setup shell completions
  const shell = detectShell();
  const alreadyHasCompletions = await hasCompletions(shell);

  if (!alreadyHasCompletions) {
    out.writeln(
      span.text("\nSetting up "),
      span.cyan(shell),
      span.text(" completions..."),
    );
    await addCompletions(shell);

    const shellConfig = shellEnv.getShellConfig(shell);
    if (shellConfig.completionType === "eval") {
      out.writeln(
        span.dim(
          `  Restart your shell or run 'source ${shellConfig.rcFile}' to enable completions.`,
        ),
      );
    }
  }

  await out.close();
  return results.ok(undefined);
};
