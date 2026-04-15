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

import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";
import * as results from "@eserstack/primitives/results";
import * as shellArgs from "@eserstack/shell/args";
import * as shellExec from "@eserstack/shell/exec";
import * as versionCheck from "./version-check.ts";
import config from "../../package.json" with { type: "json" };

const runtime = standardsCrossRuntime.runtime;

const ESER_OPTS: standardsCrossRuntime.CliCommandOptions = {
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eserstack/cli",
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
      "jsr:@eserstack/cli",
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
  const os = standardsCrossRuntime.getPlatform(); // "darwin" | "linux" | "windows"
  const arch = standardsCrossRuntime.getArch(); // "amd64" | "arm64"
  const key = `${os}-${arch}`;

  return DENO_TARGET_MAP[key];
};

/**
 * Self-updates a compiled binary from GitHub Releases.
 */
const updateCompiledBinary = async (): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(
    span.text("Install method: "),
    span.cyan("compiled binary"),
  );
  out.writeln(
    span.text("Current version: "),
    span.cyan(config.version),
    span.text("\n"),
  );

  // Check for updates
  out.writeln(span.text("Checking for updates..."));
  const check = await versionCheck.checkForUpdate();

  if (check === undefined) {
    out.writeln(span.red("Could not check for updates."));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  if (!check.updateAvailable) {
    out.writeln(span.green(`\nAlready up to date (v${config.version}).`));
    await out.close();
    return results.ok(undefined);
  }

  out.writeln(
    span.text("\nNew version available: "),
    span.cyan(`v${check.latestVersion}`),
  );

  // Determine platform
  const target = detectPlatformTarget();
  if (target === undefined) {
    const os = standardsCrossRuntime.getPlatform();
    const arch = standardsCrossRuntime.getArch();

    out.writeln(
      span.red(`\nUnsupported platform: ${os}-${arch}`),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  const tag = `v${check.latestVersion}`;
  const isWindows = standardsCrossRuntime.getPlatform() === "windows";
  const archiveExt = isWindows ? "zip" : "tar.gz";
  const archiveName = `eser-${tag}-${target}.${archiveExt}`;
  const baseUrl = `https://github.com/eser/stack/releases/download/${tag}`;

  // Download archive
  out.writeln(span.dim(`Downloading ${archiveName}...`));

  const archiveResponse = await fetch(`${baseUrl}/${archiveName}`);
  if (!archiveResponse.ok) {
    out.writeln(
      span.red(`\nFailed to download: HTTP ${archiveResponse.status}`),
    );
    await out.close();
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
        out.writeln(span.red("\nSHA256 checksum verification failed."));
        await out.close();
        return results.fail({ exitCode: 1 });
      }
      out.writeln(span.dim("Checksum verified."));
    }
  }

  // Extract to temp directory
  const tempDir = await runtime.fs.makeTempDir({ prefix: "eser-update-" });

  try {
    const archivePath = runtime.path.join(tempDir, archiveName);
    const archiveData = new Uint8Array(await archiveResponse.arrayBuffer());
    await runtime.fs.writeFile(archivePath, archiveData);

    if (isWindows) {
      await shellExec
        .exec`powershell -Command "Expand-Archive -Path ${archivePath} -DestinationPath ${tempDir}"`
        .spawn();
    } else {
      await shellExec.exec`tar -xzf ${archivePath} -C ${tempDir}`.spawn();
    }

    const newBinaryPath = isWindows
      ? runtime.path.join(tempDir, "eser.exe")
      : runtime.path.join(tempDir, "eser");
    const currentBinaryPath = runtime.process.execPath();

    if (isWindows) {
      // Windows: can't replace a running binary. Write .new.exe next to current.
      const newPath = currentBinaryPath.replace(/\.exe$/i, ".new.exe");
      await runtime.fs.copyFile(newBinaryPath, newPath);
      out.writeln(span.green(`\nDownloaded v${check.latestVersion}!`));
      out.writeln(
        span.text(
          "\nTo complete the update, close this terminal and rename:\n  ",
        ),
        span.cyan(newPath),
        span.text("\nto:\n  "),
        span.cyan(currentBinaryPath),
      );
    } else {
      // Unix: write to temp, then rename over self
      const tempBinaryPath = `${currentBinaryPath}.new`;
      await runtime.fs.copyFile(newBinaryPath, tempBinaryPath);
      await runtime.fs.chmod(tempBinaryPath, 0o755);
      await runtime.fs.rename(tempBinaryPath, currentBinaryPath);
      out.writeln(span.green(`\nUpdated to v${check.latestVersion}!`));
    }
  } catch (error) {
    if (
      (error instanceof Error && "code" in error &&
        (error as NodeJS.ErrnoException).code === "EACCES") ||
      (typeof Deno !== "undefined" &&
        error instanceof Deno.errors.PermissionDenied)
    ) {
      out.writeln(
        span.red(
          `\nPermission denied. Try running with sudo:\n  sudo eser update`,
        ),
      );
      await out.close();
      return results.fail({ exitCode: 1 });
    }
    await out.close();
    throw error;
  } finally {
    try {
      await runtime.fs.remove(tempDir, { recursive: true });
    } catch {
      // Best effort cleanup
    }
  }

  await out.close();
  return results.ok(undefined);
};

/**
 * Updates eser CLI using the appropriate method for the current install type.
 */
export const updateHandler = async (
  _ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const execContext = await standardsCrossRuntime.detectExecutionContext(
    ESER_OPTS,
  );

  // Compiled binary: self-update from GitHub Releases
  if (execContext.invoker === "binary") {
    return await updateCompiledBinary();
  }

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  // Runtime-based: use package manager
  out.writeln(
    span.text("Detected runtime: "),
    span.cyan(execContext.runtime),
  );

  const runtimeConfig = UPDATE_CONFIGS[execContext.runtime as string] ??
    UPDATE_CONFIGS["node"]!;

  const { cmd, args } = runtimeConfig;

  out.writeln(span.dim(`Running: ${cmd} ${args.join(" ")}`));
  out.writeln();

  const result = await shellExec.exec`${cmd} ${args}`
    .stdout("inherit")
    .stderr("inherit")
    .noThrow()
    .spawn();

  if (!result.success) {
    out.writeln(span.red("\nUpdate failed."));
    await out.close();
    return results.fail({ exitCode: result.code });
  }

  out.writeln(span.green("\nUpdate complete!"));
  out.writeln(
    span.text("The "),
    span.cyan("eser"),
    span.text(" command has been updated to the latest version."),
  );

  await out.close();
  return results.ok(undefined);
};
