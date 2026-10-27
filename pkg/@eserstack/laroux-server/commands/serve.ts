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

/** Lowest level the server logs. */
export type LogLevel = (typeof VALID_LOG_LEVELS)[number];

type CliResult = results.Result<void, { message?: string; exitCode: number }>;

const FLAGS: readonly shellArgs.FlagDef[] = [
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
    description: `Log level (${VALID_LOG_LEVELS.join(", ")})`,
  },
  { name: "help", short: "h", type: "boolean", description: "Show this help" },
];

/**
 * The help text of `laroux serve`.
 *
 * @returns The usage line, the options and examples
 */
export const helpText = (): string =>
  shellArgs.generateHelp(
    {
      name: "serve",
      description: "Serve the production build locally",
      usage: "laroux serve [options]",
      flags: FLAGS,
      children: [],
      examples: ["laroux serve", "laroux serve --port 3000"],
    },
    ["laroux", "serve"],
  );

/** The production server inputs, after the flags are parsed. */
export type ServeOptions = {
  /** Port the server listens on */
  readonly port: number | undefined;
  /** Lowest level the server logs */
  readonly logLevel: LogLevel;
};

/** The parts of `laroux serve` a test replaces; each defaults to the real one. */
export type ServeCommandDeps = {
  /** Starts the server; defaults to {@link startProductionServer} */
  readonly start?: (options: ServeOptions) => Promise<CliResult>;
  /** Where the command writes its own lines; defaults to stdout */
  readonly sink?: streams.Sink<unknown>;
};

/**
 * Serve the production build of the app in the working directory with the
 * React, Tailwind, Lightning CSS, Google Fonts and sharp adapters.
 *
 * @param options - The parsed flags
 * @returns ok when the server stopped; exit code 1 when its build failed
 */
export const startProductionServer = async (
  options: ServeOptions,
): Promise<CliResult> => {
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

  try {
    await server.startServer({
      mode: "serve",
      port: options.port,
      logLevel: options.logLevel,
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

/**
 * Run `laroux serve [options]`: serve the production build of the app in the
 * working directory.
 *
 * @param args - The arguments after `serve`
 * @param deps - Replacements for the server start and the output
 * @returns The result of the server start
 */
export const main = async (
  args?: readonly string[],
  deps: ServeCommandDeps = {},
): Promise<CliResult> => {
  const { flags } = shellArgs.parseFlags(args ?? [], FLAGS);

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: deps.sink ?? streams.sinks.stdout(),
  });

  if (flags["help"] === true) {
    out.writeln(helpText());
    await out.close();
    return results.ok(undefined);
  }

  out.writeln(span.cyan("\n🚀 Serving production build...\n"));
  await out.close();

  const logLevelInput = (flags["log-level"] as string) ?? "info";
  const logLevel: LogLevel = VALID_LOG_LEVELS.includes(
    logLevelInput.toLowerCase() as LogLevel,
  )
    ? (logLevelInput.toLowerCase() as LogLevel)
    : "info";

  const start = deps.start ?? startProductionServer;

  return await start({
    port: flags["port"] as number | undefined,
    logLevel,
  });
};
