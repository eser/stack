// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux build command
 *
 * Builds the application for production.
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
      name: "out-dir",
      type: "string",
      default: "dist",
      description: "Output directory",
    },
    { name: "clean", type: "boolean", description: "Clean output first" },
    { name: "no-minify", type: "boolean", description: "Disable minification" },
    { name: "analyze", type: "boolean", description: "Analyze bundle size" },
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

  out.writeln(span.cyan("\n📦 Building for production...\n"));

  const logging = await import("@eserstack/logging");
  const { runtime } = await import("@eserstack/standards/cross-runtime");

  const projectRoot = runtime.process.cwd();
  const outDir = flags["out-dir"] as string;
  const minify = !(flags["no-minify"] as boolean);
  const clean = flags["clean"] as boolean;
  const analyze = flags["analyze"] as boolean;
  const logLevelInput = (flags["log-level"] as string) ?? "info";

  const logLevel: LogLevel = VALID_LOG_LEVELS.includes(
      logLevelInput.toLowerCase() as LogLevel,
    )
    ? (logLevelInput.toLowerCase() as LogLevel)
    : "info";

  const logLevelMap = {
    trace: logging.Severities.Trace,
    debug: logging.Severities.Debug,
    info: logging.Severities.Info,
    warn: logging.Severities.Warning,
    error: logging.Severities.Error,
    fatal: logging.Severities.Critical,
  } as const;

  const loggingOut = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  await logging.config.configure({
    sinks: {
      console: logging.sinks.getOutputSink(loggingOut),
    },
    loggers: [
      {
        category: ["laroux-bundler"],
        lowestLevel: logLevelMap[logLevel],
        sinks: ["console"],
      },
    ],
  });

  const [
    { build, createBuildContext },
    { loadConfig },
    { reactPlugin },
    { createTailwindPlugin },
  ] = await Promise.all([
    import("@eserstack/laroux-bundler/system"),
    import("../config/load-config.ts"),
    import("@eserstack/laroux-bundler/adapters/react"),
    import("@eserstack/laroux-bundler/adapters/tailwindcss"),
  ]);

  const bundlerLogger = logging.logger.getLogger(["laroux-bundler", "cli"]);

  const baseConfig = await loadConfig(projectRoot);

  const buildConfig = {
    projectRoot,
    srcDir: runtime.path.resolve(projectRoot, baseConfig.srcDir),
    distDir: runtime.path.resolve(projectRoot, outDir),
    logLevel,
    fonts: baseConfig.fonts,
    images: baseConfig.images,
    cssModuleTypes: baseConfig.cssModuleTypes,
    noCssModuleAutoReference: baseConfig.noCssModuleAutoReference,
    browserShims: baseConfig.browserShims,
    serverExternals: baseConfig.build.serverExternals,
    build: {
      ...baseConfig.build,
      minify,
    },
  };

  if (clean) {
    try {
      await runtime.fs.remove(buildConfig.distDir, { recursive: true });
      bundlerLogger.debug(`Cleaned ${buildConfig.distDir}`);
    } catch {
      // Directory may not exist
    }
  }

  const tailwindPlugin = createTailwindPlugin({
    globalCssPath: runtime.path.resolve(
      projectRoot,
      "src/app/styles/global.css",
    ),
  });

  const context = createBuildContext(buildConfig, {
    framework: reactPlugin,
    css: tailwindPlugin,
    bundlerBackend: "rolldown",
  });
  await build(context);

  await logging.config.reset();

  if (analyze) {
    out.writeln(span.cyan("\n📊 Bundle Analysis:\n"));
    try {
      const manifestPath = `${outDir}/client/manifest.json`;
      const manifestText = await runtime.fs.readTextFile(manifestPath);
      const manifest = JSON.parse(manifestText);

      out.writeln(span.text("Chunks:"));
      for (
        const [file, info] of Object.entries(
          manifest.files as Record<string, { name: string; size: number }>,
        )
      ) {
        const sizeKB = (info.size / 1024).toFixed(2);
        out.writeln(
          span.text(`  ${file.padEnd(30)} ${sizeKB.padStart(8)} KB`),
        );
      }

      const totalSize = Object.values(
        manifest.files as Record<string, { size: number }>,
      ).reduce((sum, file) => sum + file.size, 0);
      out.writeln(span.dim(`\nTotal: ${(totalSize / 1024).toFixed(2)} KB`));
    } catch {
      out.writeln(
        span.yellow("Could not analyze build (manifest.json not found)"),
      );
    }
  }

  await out.close();
  return results.ok(undefined);
};
