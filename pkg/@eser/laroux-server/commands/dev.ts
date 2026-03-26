// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux dev command
 *
 * Starts development server with hot reload.
 *
 * @module
 */

import * as shellArgs from "@eser/shell/args";
import * as span from "@eser/streams/span";
import * as streams from "@eser/streams";
import * as results from "@eser/primitives/results";

const VALID_LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
] as const;
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

export const main = async (
  args?: readonly string[],
): Promise<results.Result<void, { message?: string; exitCode: number }>> => {
  const { flags } = shellArgs.parseFlags(args ?? [], [
    {
      name: "port",
      short: "p",
      type: "number",
      default: 8000,
      description: "Server port",
    },
    { name: "no-hmr", type: "boolean", description: "Disable HMR" },
    {
      name: "log-level",
      type: "string",
      default: "info",
      description: "Log level",
    },
    {
      name: "open",
      short: "o",
      type: "boolean",
      description: "Open browser",
    },
  ]);

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.cyan("\n⚡ Starting development server...\n"));

  const port = flags["port"] as number | undefined;
  const logLevelInput = (flags["log-level"] as string) ?? "info";
  const hmr = !(flags["no-hmr"] as boolean);
  const open = (flags["open"] as boolean) ?? false;

  const logLevel: LogLevel = VALID_LOG_LEVELS.includes(
      logLevelInput.toLowerCase() as LogLevel,
    )
    ? (logLevelInput.toLowerCase() as LogLevel)
    : "info";

  const [
    { startServer },
    { reactRenderer, reactHtmlShellBuilder },
    { reactPlugin },
    { createTailwindPlugin },
  ] = await Promise.all([
    import("../main.ts"),
    import("../adapters/react/mod.ts"),
    import("@eser/laroux-bundler/adapters/react"),
    import("@eser/laroux-bundler/adapters/tailwindcss"),
  ]);

  await out.close();

  await startServer({
    mode: "dev",
    port,
    logLevel,
    hmr,
    open,
    renderer: reactRenderer,
    htmlShell: reactHtmlShellBuilder,
    frameworkPlugin: reactPlugin,
    cssPlugin: createTailwindPlugin({
      globalCssPath: "src/app/styles/global.css",
    }),
  });

  return results.ok(undefined);
};
