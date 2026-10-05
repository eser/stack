// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Doctor command handler - runs diagnostic checks on the user's environment
 *
 * @module
 */

import type { CliApp } from "../app.ts";
import * as appOpts from "../app-opts.ts";
import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import * as shellExec from "@eserstack/shell/exec";
import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";
import * as versionCheck from "./version-check.ts";

const runtime = standardsCrossRuntime.runtime;

const LABEL_WIDTH = 17;

const ok = (
  out: streams.Output,
  label: string,
  value: string,
): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  out.writeln(
    span.text(`  ${padded}`),
    span.green("\u2713"),
    span.text(` ${value}`),
  );
};

const fail = (
  out: streams.Output,
  label: string,
  value: string,
): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  out.writeln(
    span.text(`  ${padded}`),
    span.red("\u2717"),
    span.text(` ${value}`),
  );
};

const info = (
  out: streams.Output,
  label: string,
  value: string,
): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  out.writeln(span.text(`  ${padded}${value}`));
};

const neutral = (
  out: streams.Output,
  label: string,
  value: string,
): void => {
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

const checkGitHooks = async (
  out: streams.Output,
  appName: string,
): Promise<void> => {
  const hookPath = runtime.path.join(
    ".",
    ".git",
    "hooks",
    "pre-commit",
  );
  const exists = await fileExists(hookPath);

  if (!exists) {
    fail(out, "Git hooks", "Not installed");
    return;
  }

  const content = await readFileOrEmpty(hookPath);

  // The hook is ours if it invokes this binary. Hardcoding "eser"
  // reported "Not installed" for a perfectly good noskills hook.
  if (content.includes(appName)) {
    ok(out, "Git hooks", "Installed");
  } else {
    fail(out, "Git hooks", "Not installed");
  }
};

const checkManifest = async (out: streams.Output): Promise<void> => {
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
    ok(out, "Manifest", ".eser/manifest.yml found");
    return;
  }

  const legacyExists = await fileExists(legacyPath);
  if (legacyExists) {
    ok(out, "Manifest", ".manifest.yml found (legacy path)");
    return;
  }

  fail(out, "Manifest", ".eser/manifest.yml not found");
};

const checkDeno = async (out: streams.Output): Promise<void> => {
  try {
    const output = await shellExec.exec`deno --version`.noThrow().quiet()
      .text();
    const version = parseToolVersion(output, /deno\s+(\S+)/);

    if (version !== undefined) {
      ok(out, "Deno", version);
    } else {
      fail(out, "Deno", "Not found");
    }
  } catch {
    fail(out, "Deno", "Not found");
  }
};

const checkGo = async (out: streams.Output): Promise<void> => {
  try {
    const output = await shellExec.exec`go version`.noThrow().quiet().text();
    const version = parseToolVersion(output, /go(\d+\.\d+(?:\.\d+)?)/);

    if (version !== undefined) {
      ok(out, "Go", version);
    } else {
      fail(out, "Go", "Not found");
    }
  } catch {
    fail(out, "Go", "Not found");
  }
};

const checkNode = async (out: streams.Output): Promise<void> => {
  try {
    const output = await shellExec.exec`node --version`.noThrow().quiet()
      .text();
    const version = output.trim();

    if (version.length > 0) {
      ok(out, "Node", version);
    } else {
      fail(out, "Node", "Not found");
    }
  } catch {
    fail(out, "Node", "Not found");
  }
};

export const doctorHandler = async (
  _ctx: shellArgs.CommandContext,
  app: CliApp,
): Promise<shellArgs.CliResult<void>> => {
  // Created per run, not at module load: importing must not touch stdout,
  // and the run closes it at the end.
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.text("eser doctor\n"));

  // Install method & version
  const execContext = await standardsCrossRuntime.detectExecutionContext(
    appOpts.appOpts(app),
  );
  info(out, "Install method", `${execContext.invoker} (${execContext.mode})`);
  info(out, "Version", _ctx.root.versionString ?? "unknown");

  // Update check
  const updateResult = await versionCheck.checkForUpdate(
    _ctx.root.versionString ?? "0.0.0",
  );

  if (updateResult === undefined) {
    neutral(out, "Update", "Could not check for updates");
  } else if (updateResult.updateAvailable) {
    fail(out, "Update", `Update available: v${updateResult.latestVersion}`);
  } else {
    ok(out, "Update", "Up to date");
  }

  out.writeln();

  // Project checks
  await checkGitHooks(out, app.command);
  await checkManifest(out);

  out.writeln();

  // Tool checks
  await checkDeno(out);
  await checkGo(out);
  await checkNode(out);

  await out.close();
  return results.ok(undefined);
};
