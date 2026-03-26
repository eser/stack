// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux serve command
 *
 * Serves the production build locally.
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
    {
      name: "log-level",
      type: "string",
      default: "info",
      description: "Log level",
    },
  ]);

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.cyan("\n🚀 Serving production build...\n"));

  const port = flags["port"] as number | undefined;
  const logLevelInput = (flags["log-level"] as string) ?? "info";

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
    import("@eser/laroux-server"),
    import("@eser/laroux-server/adapters/react"),
    import("@eser/laroux-bundler/adapters/react"),
    import("@eser/laroux-bundler/adapters/tailwindcss"),
  ]);

  await out.close();

  await startServer({
    mode: "serve",
    port,
    logLevel,
    hmr: false,
    renderer: reactRenderer,
    htmlShell: reactHtmlShellBuilder,
    frameworkPlugin: reactPlugin,
    cssPlugin: createTailwindPlugin({
      globalCssPath: "src/app/styles/global.css",
    }),
  });

  return results.ok(undefined);
};
