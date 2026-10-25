// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux serve command
 *
 * Serves the production build locally.
 *
 * @module
 */

import * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as results from "@eserstack/primitives/results";

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
    server,
    reactAdapter,
    reactBundler,
    tailwind,
    lightningcss,
    fonts,
    sharp,
  ] = await Promise.all([
    import("../main.ts"),
    import("../adapters/react/mod.ts"),
    import("@eserstack/laroux-bundler/adapters/react"),
    import("@eserstack/laroux-bundler/adapters/tailwindcss"),
    import("@eserstack/laroux-bundler/adapters/lightningcss"),
    import("@eserstack/laroux-bundler/adapters/fonts"),
    import("@eserstack/laroux-bundler/adapters/sharp"),
  ]);

  await out.close();

  try {
    await server.startServer({
      mode: "serve",
      port,
      logLevel,
      hmr: false,
      renderer: reactAdapter.reactRenderer,
      htmlShell: reactAdapter.reactHtmlShellBuilder,
      frameworkPlugin: reactBundler.reactPlugin,
      cssPlugin: tailwind.createTailwindPlugin({
        globalCssPath: "src/app/styles/global.css",
      }),
      cssProcessor: lightningcss.lightningCssProcessor,
      fontOptimizer: fonts.googleFontOptimizer,
      imageOptimizer: sharp.sharpImageOptimizer,
    });
  } catch (error) {
    // The build already logged its error; the CLI prints this summary and
    // exits non-zero instead of serving a stale or empty dist/.
    if (error instanceof server.BuildFailedError) {
      return results.fail({ message: error.message, exitCode: 1 });
    }
    throw error;
  }

  return results.ok(undefined);
};
