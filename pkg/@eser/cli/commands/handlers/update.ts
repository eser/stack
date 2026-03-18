// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Update command handler — updates eser CLI to the latest version.
 *
 * Decision tree:
 *   ┌─ ctx.invoker === "binary"  (compiled binary)
 *   │   → fetch latest release from GitHub API
 *   │   → compare versions
 *   │   → download + verify SHA256 + replace self
 *   │      → Unix: write to temp, rename() over self
 *   │      → Windows: write .new.exe, print manual instructions
 *   └─ else (runtime: deno/node/bun)
 *       → detectExecutionContext() → run package manager update command
 *
 * @module
 */

import * as fmtColors from "@eser/shell/formatting/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import * as shellExec from "@eser/shell/exec";
import * as versionCheck from "./version-check.ts";
import config from "../../package.json" with { type: "json" };

const ESER_OPTS: standardsRuntime.CliCommandOptions = {
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eser/cli",
};

type UpdateConfig = {
  readonly cmd: string;
  readonly args: readonly string[];
};

const UPDATE_CONFIGS: Record<string, UpdateConfig> = {
  deno: {
    cmd: "deno",
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

const DENO_TARGET_MAP: Record<string, string> = {
  "linux-amd64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "darwin-amd64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "windows-amd64": "x86_64-pc-windows-msvc",
};

/**
 * Detects the current platform in the format used by our release archives.
 */
const detectPlatformTarget = (): string | undefined => {
  const os = standardsRuntime.getPlatform(); // "darwin" | "linux" | "windows"
  const arch = standardsRuntime.getArch(); // "amd64" | "arm64"
  const key = `${os}-${arch}`;

  return DENO_TARGET_MAP[key];
};

/**
 * Self-updates a compiled binary from GitHub Releases.
 */
const updateCompiledBinary = async (): Promise<shellArgs.CliResult<void>> => {
  const rt = standardsRuntime.current;

  // deno-lint-ignore no-console
  console.log(
    `Install method: ${fmtColors.cyan("compiled binary")}`,
  );
  // deno-lint-ignore no-console
  console.log(`Current version: ${fmtColors.cyan(config.version)}\n`);

  // Check for updates
  // deno-lint-ignore no-console
  console.log("Checking for updates...");
  const check = await versionCheck.checkForUpdate();

  if (check === undefined) {
    // deno-lint-ignore no-console
    console.error(fmtColors.red("Could not check for updates."));
    return results.fail({ exitCode: 1 });
  }

  if (!check.updateAvailable) {
    // deno-lint-ignore no-console
    console.log(fmtColors.green(`\nAlready up to date (v${config.version}).`));
    return results.ok(undefined);
  }

  // deno-lint-ignore no-console
  console.log(
    `\nNew version available: ${fmtColors.cyan(`v${check.latestVersion}`)}`,
  );

  // Determine platform
  const target = detectPlatformTarget();
  if (target === undefined) {
    const os = standardsRuntime.getPlatform();
    const arch = standardsRuntime.getArch();

    // deno-lint-ignore no-console
    console.error(
      fmtColors.red(
        `\nUnsupported platform: ${os}-${arch}`,
      ),
    );
    return results.fail({ exitCode: 1 });
  }

  const tag = `v${check.latestVersion}`;
  const isWindows = standardsRuntime.getPlatform() === "windows";
  const archiveExt = isWindows ? "zip" : "tar.gz";
  const archiveName = `eser-${tag}-${target}.${archiveExt}`;
  const baseUrl = `https://github.com/eser/stack/releases/download/${tag}`;

  // Download archive
  // deno-lint-ignore no-console
  console.log(fmtColors.dim(`Downloading ${archiveName}...`));

  const archiveResponse = await fetch(`${baseUrl}/${archiveName}`);
  if (!archiveResponse.ok) {
    // deno-lint-ignore no-console
    console.error(
      fmtColors.red(
        `\nFailed to download: HTTP ${archiveResponse.status}`,
      ),
    );
    return results.fail({ exitCode: 1 });
  }

  // Download SHA256SUMS.txt and verify
  const sumsResponse = await fetch(`${baseUrl}/SHA256SUMS.txt`);
  if (sumsResponse.ok) {
    const sumsText = await sumsResponse.text();
    const expectedLine = sumsText
      .split("\n")
      .find((line) => line.includes(archiveName));
    if (expectedLine !== undefined) {
      const expectedHash = expectedLine.split(/\s+/)[0]!;
      const archiveData = new Uint8Array(
        await archiveResponse.clone().arrayBuffer(),
      );
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        archiveData as unknown as BufferSource,
      );
      const actualHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (actualHash !== expectedHash) {
        // deno-lint-ignore no-console
        console.error(fmtColors.red("\nSHA256 checksum verification failed."));
        return results.fail({ exitCode: 1 });
      }
      // deno-lint-ignore no-console
      console.log(fmtColors.dim("Checksum verified."));
    }
  }

  // Extract to temp directory
  const tempDir = await rt.fs.makeTempDir({ prefix: "eser-update-" });

  try {
    const archivePath = rt.path.join(tempDir, archiveName);
    const archiveData = new Uint8Array(await archiveResponse.arrayBuffer());
    await rt.fs.writeFile(archivePath, archiveData);

    if (isWindows) {
      await shellExec
        .exec`powershell -Command "Expand-Archive -Path ${archivePath} -DestinationPath ${tempDir}"`
        .spawn();
    } else {
      await shellExec.exec`tar -xzf ${archivePath} -C ${tempDir}`.spawn();
    }

    const newBinaryPath = isWindows
      ? rt.path.join(tempDir, "eser.exe")
      : rt.path.join(tempDir, "eser");
    const currentBinaryPath = rt.process.execPath();

    if (isWindows) {
      // Windows: can't replace a running binary. Write .new.exe next to current.
      const newPath = currentBinaryPath.replace(/\.exe$/i, ".new.exe");
      await rt.fs.copyFile(newBinaryPath, newPath);
      // deno-lint-ignore no-console
      console.log(fmtColors.green(`\nDownloaded v${check.latestVersion}!`));
      // deno-lint-ignore no-console
      console.log(
        `\nTo complete the update, close this terminal and rename:\n  ${
          fmtColors.cyan(newPath)
        }\nto:\n  ${fmtColors.cyan(currentBinaryPath)}`,
      );
    } else {
      // Unix: write to temp, then rename over self
      const tempBinaryPath = `${currentBinaryPath}.new`;
      await rt.fs.copyFile(newBinaryPath, tempBinaryPath);
      await rt.fs.chmod(tempBinaryPath, 0o755);
      await rt.fs.rename(tempBinaryPath, currentBinaryPath);
      // deno-lint-ignore no-console
      console.log(fmtColors.green(`\nUpdated to v${check.latestVersion}!`));
    }
  } catch (error) {
    if (
      error instanceof Deno.errors.PermissionDenied
    ) {
      // deno-lint-ignore no-console
      console.error(
        fmtColors.red(
          `\nPermission denied. Try running with sudo:\n  sudo eser update`,
        ),
      );
      return results.fail({ exitCode: 1 });
    }
    throw error;
  } finally {
    try {
      await rt.fs.remove(tempDir, { recursive: true });
    } catch {
      // Best effort cleanup
    }
  }

  return results.ok(undefined);
};

/**
 * Updates eser CLI using the appropriate method for the current install type.
 */
export const updateHandler = async (
  _ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const execContext = await standardsRuntime.detectExecutionContext(ESER_OPTS);

  // Compiled binary: self-update from GitHub Releases
  if (execContext.invoker === "binary") {
    return await updateCompiledBinary();
  }

  // Runtime-based: use package manager
  // deno-lint-ignore no-console
  console.log(
    `Detected runtime: ${fmtColors.cyan(execContext.runtime)}`,
  );

  const runtimeConfig = UPDATE_CONFIGS[execContext.runtime as string] ??
    UPDATE_CONFIGS["node"]!;

  const { cmd, args } = runtimeConfig;

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
    console.error(fmtColors.red("\nUpdate failed."));
    return results.fail({ exitCode: result.code });
  }

  // deno-lint-ignore no-console
  console.log(fmtColors.green("\nUpdate complete!"));
  // deno-lint-ignore no-console
  console.log(
    `The ${
      fmtColors.cyan("eser")
    } command has been updated to the latest version.`,
  );

  return results.ok(undefined);
};
