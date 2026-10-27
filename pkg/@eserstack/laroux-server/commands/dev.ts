// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux dev command
 *
 * Starts development server with hot reload.
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

/** Lowest level the dev server logs. */
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
  { name: "no-hmr", type: "boolean", description: "Disable HMR" },
  {
    name: "log-level",
    type: "string",
    default: "info",
    description: `Log level (${VALID_LOG_LEVELS.join(", ")})`,
  },
  {
    name: "open",
    short: "o",
    type: "boolean",
    description: "Open browser",
  },
  { name: "help", short: "h", type: "boolean", description: "Show this help" },
];

/**
 * The help text of `laroux dev`.
 *
 * @returns The usage line, the options and examples
 */
export const helpText = (): string =>
  shellArgs.generateHelp(
    {
      name: "dev",
      description: "Start the development server with hot reload",
      usage: "laroux dev [options]",
      flags: FLAGS,
      children: [],
      examples: ["laroux dev", "laroux dev --port 3000 --open"],
    },
    ["laroux", "dev"],
  );

/** The dev server inputs, after the flags are parsed. */
export type DevServerOptions = {
  /** Port the server listens on */
  readonly port: number | undefined;
  /** Lowest level the server logs */
  readonly logLevel: LogLevel;
  /** Serve hot module replacement updates */
  readonly hmr: boolean;
  /** Open the app in a browser once the server listens */
  readonly open: boolean;
};

/** The parts of `laroux dev` a test replaces; each defaults to the real one. */
export type DevCommandDeps = {
  /** Starts the server; defaults to {@link startDevServer} */
  readonly start?: (options: DevServerOptions) => Promise<CliResult>;
  /** Where the command writes its own lines; defaults to stdout */
  readonly sink?: streams.Sink<unknown>;
};

/**
 * Start the dev server in the working directory with the React, Tailwind,
 * Lightning CSS, Google Fonts and sharp adapters.
 *
 * @param options - The parsed flags
 * @returns ok when the server stopped; exit code 1 when its build failed
 */
export const startDevServer = async (
  options: DevServerOptions,
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
      mode: "dev",
      port: options.port,
      logLevel: options.logLevel,
      hmr: options.hmr,
      open: options.open,
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
 * Run `laroux dev [options]`: start the dev server in the working directory.
 *
 * @param args - The arguments after `dev`
 * @param deps - Replacements for the server start and the output
 * @returns The result of the server start
 */
export const main = async (
  args?: readonly string[],
  deps: DevCommandDeps = {},
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

  out.writeln(span.cyan("\n⚡ Starting development server...\n"));
  await out.close();

  const logLevelInput = (flags["log-level"] as string) ?? "info";
  const logLevel: LogLevel = VALID_LOG_LEVELS.includes(
    logLevelInput.toLowerCase() as LogLevel,
  )
    ? (logLevelInput.toLowerCase() as LogLevel)
    : "info";

  const start = deps.start ?? startDevServer;

  return await start({
    port: flags["port"] as number | undefined,
    logLevel,
    hmr: !(flags["no-hmr"] as boolean),
    open: (flags["open"] as boolean) ?? false,
  });
};
