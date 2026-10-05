// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Info command handler - shows runtime and execution context diagnostics
 *
 * @module
 */

import * as appOpts from "../app-opts.ts";
import type { CliApp } from "../app.ts";
import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";

const runtime = standardsCrossRuntime.runtime;

const LABEL_WIDTH = 20;

const info = (
  out: streams.Output,
  label: string,
  value: string,
): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  out.writeln(span.text(`  ${padded}${value}`));
};

export const infoHandler = async (
  _ctx: shellArgs.CommandContext,
  app: CliApp,
): Promise<shellArgs.CliResult<void>> => {
  // Created per run, not at module load: importing must not touch stdout,
  // and the run closes it at the end.
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.text("eser system info"));

  // ── Runtime ──
  out.writeln(span.dim("\n  Runtime"));
  info(out, "Name", runtime.name);
  info(out, "Version", runtime.version);
  info(out, "Platform", standardsCrossRuntime.getPlatform());
  info(out, "Arch", standardsCrossRuntime.getArch());
  const caps = runtime.capabilities;
  const capList = Object.entries(caps)
    .map(([k, v]) => `${k}=${v ? "yes" : "no"}`)
    .join(", ");
  info(out, "Capabilities", capList);

  // ── Locations ──
  out.writeln(span.dim("\n  Locations"));
  info(out, "Homedir", standardsCrossRuntime.getHomedir());
  info(out, "Tmpdir", standardsCrossRuntime.getTmpdir());
  info(out, "CWD", runtime.process.cwd());
  info(out, "PID", String(runtime.process.pid));
  info(out, "Exec path", runtime.process.execPath());

  // ── Process ──
  out.writeln(span.dim("\n  Process"));
  info(out, "argv0", runtime.process.argv0);
  info(out, "argv", runtime.process.argv.join(" "));
  info(out, "args", runtime.process.args.join(" "));

  // ── Execution Context ──
  out.writeln(span.dim("\n  Execution Context"));
  const ctx = await standardsCrossRuntime.detectExecutionContext(
    appOpts.appOpts(app),
  );
  info(out, "Runtime", ctx.runtime);
  info(out, "Invoker", `${ctx.invoker} (${ctx.mode})`);
  info(out, "Command", ctx.command);
  info(out, "In PATH", ctx.isInPath ? "yes" : "no");

  // ── Environment (selected) ──
  out.writeln(span.dim("\n  Environment"));
  const envKeys = [
    "PATH",
    "HOME",
    "SHELL",
    "TERM",
    "DENO_DIR",
    "BUN_INSTALL",
    "NODE_ENV",
  ];
  for (const key of envKeys) {
    const value = runtime.env.get(key);
    if (value !== undefined) {
      const display = key === "PATH"
        ? `(${value.split(":").length} entries)`
        : value;
      info(out, key, display);
    }
  }

  out.writeln();
  await out.close();
  return results.ok(undefined);
};
