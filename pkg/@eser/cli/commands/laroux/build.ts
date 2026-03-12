// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux build command handler
 *
 * Builds the application for production.
 * Uses dynamic imports to avoid loading react-dom/server.
 *
 * @module
 */

import * as fmtColors from "@std/fmt/colors";
import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";

// Valid log levels
const VALID_LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
] as const;
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

export const buildHandler = async (
  ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  // deno-lint-ignore no-console
  console.log(fmtColors.cyan("\n📦 Building for production...\n"));

  // Configure logging FIRST (before importing bundler modules that create loggers)
  const logging = await import("@eser/logging");
  const { runtime } = await import("@eser/standards/runtime");

  // Get flags with defaults
  const projectRoot = runtime.process.cwd();
  const outDir = (ctx.flags["out-dir"] as string) ?? "dist";
  const minify = !(ctx.flags["no-minify"] as boolean);
  const clean = (ctx.flags["clean"] as boolean) ?? false;
  const analyze = (ctx.flags["analyze"] as boolean) ?? false;
  const logLevelInput = (ctx.flags["log-level"] as string) ?? "info";

  // Validate log level
  const logLevel: LogLevel = VALID_LOG_LEVELS.includes(
      logLevelInput.toLowerCase() as LogLevel,
    )
    ? (logLevelInput.toLowerCase() as LogLevel)
    : "info";

  // Map log level names to @eser/logging severity values
  const logLevelMap = {
    trace: logging.Severities.Trace,
    debug: logging.Severities.Debug,
    info: logging.Severities.Info,
    warn: logging.Severities.Warning,
    error: logging.Severities.Error,
    fatal: logging.Severities.Critical,
  } as const;

  await logging.config.configure({
    sinks: {
      console: logging.sinks.getConsoleSink({
        formatter: logging.formatters.ansiColorFormatter(),
      }),
    },
    loggers: [
      {
        category: ["laroux-bundler"],
        lowestLevel: logLevelMap[logLevel],
        sinks: ["console"],
      },
    ],
  });

  // Now import bundler modules (their loggers will use our config)
  const [
    { build, createBuildContext },
    { loadConfig },
    { reactPlugin },
    { createTailwindPlugin },
  ] = await Promise.all([
    import("@eser/laroux-bundler/system"),
    import("@eser/laroux-server/config"),
    import("@eser/laroux-bundler/adapters/react"),
    import("@eser/laroux-bundler/adapters/tailwindcss"),
  ]);

  const bundlerLogger = logging.logger.getLogger(["laroux-bundler", "cli"]);

  // Load configuration
  const baseConfig = await loadConfig(projectRoot);

  // Build config (only what bundler needs)
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

  // Clean dist directory if requested
  if (clean) {
    try {
      await runtime.fs.remove(buildConfig.distDir, { recursive: true });
      bundlerLogger.debug(`Cleaned ${buildConfig.distDir}`);
    } catch {
      // Directory may not exist
    }
  }

  // Create plugins
  const tailwindPlugin = createTailwindPlugin({
    globalCssPath: runtime.path.resolve(
      projectRoot,
      "src/app/styles/global.css",
    ),
  });

  // Run production build
  const context = createBuildContext(buildConfig, {
    framework: reactPlugin,
    css: tailwindPlugin,
    bundlerBackend: "rolldown",
  });
  await build(context);

  // Clean up logging
  await logging.config.reset();

  // Analyze bundle if requested
  if (analyze) {
    await analyzeBuild(runtime, outDir);
  }

  return results.ok(undefined);
};

async function analyzeBuild(
  runtime: { fs: { readTextFile: (path: string) => Promise<string> } },
  outDir: string,
) {
  // deno-lint-ignore no-console
  console.log(fmtColors.cyan("\n📊 Bundle Analysis:\n"));

  try {
    const manifestPath = `${outDir}/client/manifest.json`;
    const manifestText = await runtime.fs.readTextFile(manifestPath);
    const manifest = JSON.parse(manifestText);

    // Display chunk sizes
    // deno-lint-ignore no-console
    console.log("Chunks:");
    for (
      const [file, info] of Object.entries(
        manifest.files as Record<string, { name: string; size: number }>,
      )
    ) {
      const sizeKB = (info.size / 1024).toFixed(2);
      // deno-lint-ignore no-console
      console.log(`  ${file.padEnd(30)} ${sizeKB.padStart(8)} KB`);
    }

    // Calculate total size
    const totalSize = Object.values(
      manifest.files as Record<string, { size: number }>,
    ).reduce((sum, file) => sum + file.size, 0);

    // deno-lint-ignore no-console
    console.log(fmtColors.dim(`\nTotal: ${(totalSize / 1024).toFixed(2)} KB`));
  } catch {
    // deno-lint-ignore no-console
    console.log(
      fmtColors.yellow("Could not analyze build (manifest.json not found)"),
    );
  }
}
