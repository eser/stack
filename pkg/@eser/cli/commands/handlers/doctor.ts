// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Doctor command handler - runs diagnostic checks on the user's environment
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import * as shellExec from "@eser/shell/exec";
import * as fmtColors from "@eser/shell/formatting/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import * as versionCheck from "./version-check.ts";
import config from "../../package.json" with { type: "json" };

const ESER_OPTS: standardsRuntime.CliCommandOptions = {
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eser/cli",
};

const LABEL_WIDTH = 17;

const ok = (label: string, value: string): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  // deno-lint-ignore no-console
  console.log(`  ${padded}${fmtColors.green("\u2713")} ${value}`);
};

const fail = (label: string, value: string): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  // deno-lint-ignore no-console
  console.log(`  ${padded}${fmtColors.red("\u2717")} ${value}`);
};

const info = (label: string, value: string): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  // deno-lint-ignore no-console
  console.log(`  ${padded}${value}`);
};

const neutral = (label: string, value: string): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  // deno-lint-ignore no-console
  console.log(`  ${padded}${fmtColors.dim("-")} ${value}`);
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await standardsRuntime.current.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

const readFileOrEmpty = async (path: string): Promise<string> => {
  try {
    return await standardsRuntime.current.fs.readTextFile(path);
  } catch {
    return "";
  }
};

const parseToolVersion = (
  output: string,
  pattern: RegExp,
): string | undefined => {
  const match = output.match(pattern);

  return match?.[1];
};

const checkGitHooks = async (): Promise<void> => {
  const hookPath = standardsRuntime.current.path.join(
    ".",
    ".git",
    "hooks",
    "pre-commit",
  );
  const exists = await fileExists(hookPath);

  if (!exists) {
    fail("Git hooks", "Not installed");
    return;
  }

  const content = await readFileOrEmpty(hookPath);

  if (content.includes("eser")) {
    ok("Git hooks", "Installed");
  } else {
    fail("Git hooks", "Not installed");
  }
};

const checkManifest = async (): Promise<void> => {
  const manifestPath = standardsRuntime.current.path.join(
    ".",
    ".manifest.yml",
  );
  const exists = await fileExists(manifestPath);

  if (exists) {
    ok("Manifest", ".manifest.yml found");
  } else {
    fail("Manifest", ".manifest.yml not found");
  }
};

const checkDeno = async (): Promise<void> => {
  try {
    const output = await shellExec.exec`deno --version`.noThrow().quiet()
      .text();
    const version = parseToolVersion(output, /deno\s+(\S+)/);

    if (version !== undefined) {
      ok("Deno", version);
    } else {
      fail("Deno", "Not found");
    }
  } catch {
    fail("Deno", "Not found");
  }
};

const checkGo = async (): Promise<void> => {
  try {
    const output = await shellExec.exec`go version`.noThrow().quiet().text();
    const version = parseToolVersion(output, /go(\d+\.\d+(?:\.\d+)?)/);

    if (version !== undefined) {
      ok("Go", version);
    } else {
      fail("Go", "Not found");
    }
  } catch {
    fail("Go", "Not found");
  }
};

const checkNode = async (): Promise<void> => {
  try {
    const output = await shellExec.exec`node --version`.noThrow().quiet()
      .text();
    const version = output.trim();

    if (version.length > 0) {
      ok("Node", version);
    } else {
      fail("Node", "Not found");
    }
  } catch {
    fail("Node", "Not found");
  }
};

export const doctorHandler = async (
  _ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  // deno-lint-ignore no-console
  console.log("eser doctor\n");

  // Install method & version
  const execContext = await standardsRuntime.detectExecutionContext(ESER_OPTS);
  info("Install method", `${execContext.invoker} (${execContext.mode})`);
  info("Version", config.version);

  // Update check
  const updateResult = await versionCheck.checkForUpdate();

  if (updateResult === undefined) {
    neutral("Update", "Could not check for updates");
  } else if (updateResult.updateAvailable) {
    fail("Update", `Update available: v${updateResult.latestVersion}`);
  } else {
    ok("Update", "Up to date");
  }

  // deno-lint-ignore no-console
  console.log("");

  // Project checks
  await checkGitHooks();
  await checkManifest();

  // deno-lint-ignore no-console
  console.log("");

  // Tool checks
  await checkDeno();
  await checkGo();
  await checkNode();

  return results.ok(undefined);
};
