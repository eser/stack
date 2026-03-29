// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Info command handler - shows runtime and execution context diagnostics
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import * as span from "@eser/streams/span";
import * as streams from "@eser/streams";
import * as standardsCrossRuntime from "@eser/standards/cross-runtime";

const runtime = standardsCrossRuntime.runtime;

const ESER_OPTS: standardsCrossRuntime.CliCommandOptions = {
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eser/cli",
};

const LABEL_WIDTH = 20;

const out = streams.output({
  renderer: streams.renderers.ansi(),
  sink: streams.sinks.stdout(),
});

const info = (label: string, value: string): void => {
  const padded = `${label}:`.padEnd(LABEL_WIDTH);

  out.writeln(span.text(`  ${padded}${value}`));
};

export const infoHandler = async (
  _ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  out.writeln(span.text("eser system info"));

  // ── Runtime ──
  out.writeln(span.dim("\n  Runtime"));
  info("Name", runtime.name);
  info("Version", runtime.version);
  info("Platform", standardsCrossRuntime.getPlatform());
  info("Arch", standardsCrossRuntime.getArch());
  const caps = runtime.capabilities;
  const capList = Object.entries(caps)
    .map(([k, v]) => `${k}=${v ? "yes" : "no"}`)
    .join(", ");
  info("Capabilities", capList);

  // ── Locations ──
  out.writeln(span.dim("\n  Locations"));
  info("Homedir", standardsCrossRuntime.getHomedir());
  info("Tmpdir", standardsCrossRuntime.getTmpdir());
  info("CWD", runtime.process.cwd());
  info("PID", String(runtime.process.pid));
  info("Exec path", runtime.process.execPath());

  // ── Process ──
  out.writeln(span.dim("\n  Process"));
  info("argv0", runtime.process.argv0);
  info("argv", runtime.process.argv.join(" "));
  info("args", runtime.process.args.join(" "));

  // ── Execution Context ──
  out.writeln(span.dim("\n  Execution Context"));
  const ctx = await standardsCrossRuntime.detectExecutionContext(ESER_OPTS);
  info("Runtime", ctx.runtime);
  info("Invoker", `${ctx.invoker} (${ctx.mode})`);
  info("Command", ctx.command);
  info("In PATH", ctx.isInPath ? "yes" : "no");

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
      info(key, display);
    }
  }

  out.writeln();
  await out.close();
  return results.ok(undefined);
};
