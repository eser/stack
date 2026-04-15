// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Doctor command handler - runs diagnostic checks on the user's environment
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as shellArgs from "@eserstack/shell/args";
import * as shellExec from "@eserstack/shell/exec";
import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";
import * as versionCheck from "./version-check.ts";
import config from "../../package.json" with { type: "json" };

const runtime = standardsCrossRuntime.runtime;

const ESER_OPTS: standardsCrossRuntime.CliCommandOptions = {
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eserstack/cli",
};

const LABEL_WIDTH = 17;

const out = streams.output({
  renderer: streams.renderers.ansi(),
  sink: streams.sinks.stdout(),
});

const ok = (label: string, value: string): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  out.writeln(
    span.text(`  ${padded}`),
    span.green("\u2713"),
    span.text(` ${value}`),
  );
};

const fail = (label: string, value: string): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  out.writeln(
    span.text(`  ${padded}`),
    span.red("\u2717"),
    span.text(` ${value}`),
  );
};

const info = (label: string, value: string): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  out.writeln(span.text(`  ${padded}${value}`));
};

const neutral = (label: string, value: string): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  out.writeln(span.text(`  ${padded}`), span.dim("-"), span.text(` ${value}`));
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

const readFileOrEmpty = async (path: string): Promise<string> => {
  try {
    return await runtime.fs.readTextFile(path);
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
  const hookPath = runtime.path.join(
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
  const newPath = runtime.path.join(
    ".",
    ".eser",
    "manifest.yml",
  );
  const legacyPath = runtime.path.join(
    ".",
    ".manifest.yml",
  );

  const newExists = await fileExists(newPath);
  if (newExists) {
    ok("Manifest", ".eser/manifest.yml found");
    return;
  }

  const legacyExists = await fileExists(legacyPath);
  if (legacyExists) {
    ok("Manifest", ".manifest.yml found (legacy path)");
    return;
  }

  fail("Manifest", ".eser/manifest.yml not found");
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
  out.writeln(span.text("eser doctor\n"));

  // Install method & version
  const execContext = await standardsCrossRuntime.detectExecutionContext(
    ESER_OPTS,
  );
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

  out.writeln();

  // Project checks
  await checkGitHooks();
  await checkManifest();

  out.writeln();

  // Tool checks
  await checkDeno();
  await checkGo();
  await checkNode();

  await out.close();
  return results.ok(undefined);
};
