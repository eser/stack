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
import { appOpts } from "../app-opts.ts";
import type { CliApp } from "../app.ts";
import * as results from "@eserstack/primitives/results";
import * as shellArgs from "@eserstack/shell/args";
import * as shellExec from "@eserstack/shell/exec";
import * as versionCheck from "./version-check.ts";

const runtime = standardsCrossRuntime.runtime;

type UpdateConfig = {
  readonly cmd: string;
  readonly args: readonly string[];
};

// A function of the app: the same table updates eser, noskills or laroux.
const updateConfigs = (app: CliApp): Record<string, UpdateConfig> => ({
  deno: {
    cmd: "deno",
    args: [
      "install",
      "-r",
      "-g",
      "-A",
      "-f",
      "--name",
      app.command,
      "jsr:@eserstack/cli",
    ],
  },
  node: {
    cmd: "npm",
    args: ["update", "-g", "-f", app.npmPackage ?? app.command],
  },
  bun: {
    cmd: "bun",
    args: ["update", "-g", "-f", app.npmPackage ?? app.command],
  },
});

/**
 * The checksum SHA256SUMS.txt records for `archiveName`, if any.
 *
 * Matches the second field exactly, the way install.sh's
 * `awk -v want="${ARCHIVE}" '$2 == want { print $1 }'` does. A substring test
 * would happily accept the line for a DIFFERENT artifact whose name merely
 * contains this one -- `<archive>.sig`, `<archive>.sha256` -- and verify the
 * download against a checksum that was never about it.
 */
export const findExpectedChecksum = (
  sumsText: string,
  archiveName: string,
): string | undefined => {
  for (const line of sumsText.split("\n")) {
    const fields = line.trim().split(/\s+/);

    if (fields.length >= 2 && fields[1] === archiveName) {
      return fields[0];
    }
  }

  return undefined;
};

const sha256Hex = async (data: Uint8Array): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data as unknown as BufferSource,
  );

  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Verifies a downloaded release archive against the release's SHA256SUMS.txt.
 *
 * Fails CLOSED on every path, matching install.sh: the list being unreachable
 * and the list not naming this archive are refusals, not permission to skip
 * verification. Anyone able to suppress or truncate SHA256SUMS.txt -- a proxy,
 * a captive portal, a partial release upload -- would otherwise get an
 * unverified binary written over the running one.
 */
export const verifyArchiveChecksum = async (
  baseUrl: string,
  archiveName: string,
  archiveData: Uint8Array,
  fetchFn?: typeof fetch,
): Promise<results.Result<void, string>> => {
  const doFetch = fetchFn ?? globalThis.fetch.bind(globalThis);
  const sumsUrl = `${baseUrl}/SHA256SUMS.txt`;

  let sumsResponse: Response;

  try {
    sumsResponse = await doFetch(sumsUrl);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return results.fail(
      `Could not download ${sumsUrl}: ${reason}\n` +
        "Refusing to install a binary that cannot be verified. Check your " +
        "network or proxy and try again.",
    );
  }

  if (!sumsResponse.ok) {
    return results.fail(
      `Could not download ${sumsUrl}: HTTP ${sumsResponse.status}\n` +
        "Refusing to install a binary that cannot be verified. Check your " +
        "network or proxy and try again.",
    );
  }

  const sumsText = await sumsResponse.text();
  const expectedHash = findExpectedChecksum(sumsText, archiveName);

  if (expectedHash === undefined) {
    return results.fail(
      `No checksum listed for ${archiveName} in ${sumsUrl}\n` +
        "Refusing to install a binary that cannot be verified. The release " +
        "may be incomplete; report it at " +
        "https://github.com/eser/stack/issues",
    );
  }

  const actualHash = await sha256Hex(archiveData);

  if (actualHash !== expectedHash) {
    return results.fail(
      `SHA256 checksum verification failed for ${archiveName}\n` +
        `  expected ${expectedHash}\n` +
        `  actual   ${actualHash}\n` +
        "Refusing to install. Re-run the update; if it persists, report it at " +
        "https://github.com/eser/stack/issues",
    );
  }

  return results.ok(undefined);
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
const updateCompiledBinary = async (
  app: CliApp,
  currentVersion: string,
): Promise<shellArgs.CliResult<void>> => {
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
    span.cyan(currentVersion),
    span.text("\n"),
  );

  // Check for updates
  out.writeln(span.text("Checking for updates..."));
  const check = await versionCheck.checkForUpdate(currentVersion);

  if (check === undefined) {
    out.writeln(span.red("Could not check for updates."));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  if (!check.updateAvailable) {
    out.writeln(span.green(`\nAlready up to date (v${currentVersion}).`));
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
  const archiveName = `${app.command}-${tag}-${target}.${archiveExt}`;
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

  // Download SHA256SUMS.txt and verify. Verification is mandatory: see
  // verifyArchiveChecksum for why every failure path is a refusal.
  const archiveBytes = new Uint8Array(
    await archiveResponse.clone().arrayBuffer(),
  );
  const verification = await verifyArchiveChecksum(
    baseUrl,
    archiveName,
    archiveBytes,
  );

  if (results.isFail(verification)) {
    out.writeln(span.red(`\n${verification.error}`));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  out.writeln(span.dim("Checksum verified."));

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
      : runtime.path.join(tempDir, app.command);
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
          `\nPermission denied. Try running with sudo:\n  sudo ${app.command} update`,
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
  app: CliApp,
): Promise<shellArgs.CliResult<void>> => {
  const execContext = await standardsCrossRuntime.detectExecutionContext(
    appOpts(app),
  );

  // Compiled binary: self-update from GitHub Releases
  if (execContext.invoker === "binary") {
    return await updateCompiledBinary(app, _ctx.root.versionString ?? "0.0.0");
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

  const runtimeConfig = updateConfigs(app)[execContext.runtime as string] ??
    updateConfigs(app)["node"]!;

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
    span.cyan(app.command),
    span.text(" command has been updated to the latest version."),
  );

  await out.close();
  return results.ok(undefined);
};
