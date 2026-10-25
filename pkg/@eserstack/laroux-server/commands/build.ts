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
import type {
  CssPlugin,
  CssProcessor,
  FontOptimizer,
  FrameworkPlugin,
  ImageOptimizer,
} from "@eserstack/laroux-bundler";

/** Lowest level the bundler logs during the build. */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const VALID_LOG_LEVELS: readonly LogLevel[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];

/** Exit code of a build whose bundler step failed. */
const BUILD_FAILED_EXIT_CODE = 1;

/** Inputs of one production build, after the flags are parsed. */
export type BuildCommandOptions = {
  /** App root that holds laroux.config.ts and the source directory */
  readonly projectRoot: string;
  /** Output directory, relative to projectRoot */
  readonly outDir: string;
  /** Minify the client bundle */
  readonly minify: boolean;
  /** Remove the output directory before building */
  readonly clean: boolean;
  /** Print the chunk sizes after a successful build */
  readonly analyze: boolean;
  /** Lowest level the bundler logs */
  readonly logLevel: LogLevel;
  /** Bundler framework plugin; the CLI passes the React plugin */
  readonly frameworkPlugin: FrameworkPlugin;
  /** Bundler CSS plugin; the CLI passes the Tailwind plugin */
  readonly cssPlugin?: CssPlugin;
  /** Stylesheet processor; the CLI passes the Lightning CSS processor */
  readonly cssProcessor?: CssProcessor;
  /** Font optimizer; the CLI passes the Google Fonts optimizer */
  readonly fontOptimizer?: FontOptimizer;
  /** Image optimizer; the CLI passes the sharp optimizer */
  readonly imageOptimizer?: ImageOptimizer;
};

/**
 * Run `laroux build` with CLI arguments, building the app in the working
 * directory with the React, Tailwind, Lightning CSS, Google Fonts and sharp
 * adapters.
 */
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

  const logLevelInput = (flags["log-level"] as string) ?? "info";
  const logLevel: LogLevel = VALID_LOG_LEVELS.includes(
    logLevelInput.toLowerCase() as LogLevel,
  )
    ? (logLevelInput.toLowerCase() as LogLevel)
    : "info";

  const [crossRuntime, reactBundler, tailwindcss, lightningcss, fonts, sharp] =
    await Promise.all([
      import("@eserstack/standards/cross-runtime"),
      import("@eserstack/laroux-bundler/adapters/react"),
      import("@eserstack/laroux-bundler/adapters/tailwindcss"),
      import("@eserstack/laroux-bundler/adapters/lightningcss"),
      import("@eserstack/laroux-bundler/adapters/fonts"),
      import("@eserstack/laroux-bundler/adapters/sharp"),
    ]);
  const projectRoot = crossRuntime.runtime.process.cwd();

  return await runBuild({
    projectRoot,
    outDir: flags["out-dir"] as string,
    minify: !(flags["no-minify"] as boolean),
    clean: flags["clean"] as boolean,
    analyze: flags["analyze"] as boolean,
    logLevel,
    frameworkPlugin: reactBundler.reactPlugin,
    cssPlugin: tailwindcss.createTailwindPlugin({
      globalCssPath: crossRuntime.runtime.path.resolve(
        projectRoot,
        "src/app/styles/global.css",
      ),
    }),
    cssProcessor: lightningcss.lightningCssProcessor,
    fontOptimizer: fonts.googleFontOptimizer,
    imageOptimizer: sharp.sharpImageOptimizer,
  });
};

/**
 * Build the app at options.projectRoot for production. Fails with exit code
 * 1, and skips the bundle analysis, when the bundler build fails; the bundler
 * has already logged the failing step and its error.
 */
export const runBuild = async (
  options: BuildCommandOptions,
): Promise<results.Result<void, { message?: string; exitCode: number }>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.cyan("\n📦 Building for production...\n"));

  const logging = await import("@eserstack/logging");
  const crossRuntime = await import("@eserstack/standards/cross-runtime");
  const runtime = crossRuntime.runtime;

  const { projectRoot, outDir, minify, clean, analyze, logLevel } = options;

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

  const [system, loadConfig] = await Promise.all([
    import("@eserstack/laroux-bundler/system"),
    import("../config/load-config.ts"),
  ]);

  const bundlerLogger = logging.logger.getLogger(["laroux-bundler", "cli"]);

  const baseConfig = await loadConfig.loadConfig(projectRoot);

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

  if (clean && (await runtime.fs.exists(buildConfig.distDir))) {
    await runtime.fs.remove(buildConfig.distDir, { recursive: true });
    bundlerLogger.debug(`Cleaned ${buildConfig.distDir}`);
  }

  const context = system.createBuildContext(buildConfig, {
    framework: options.frameworkPlugin,
    css: options.cssPlugin,
    cssProcessor: options.cssProcessor,
    fontOptimizer: options.fontOptimizer,
    imageOptimizer: options.imageOptimizer,
    bundlerBackend: "rolldown",
  });
  const buildResult = await system.build(context);

  await logging.config.reset();

  if (!buildResult.success) {
    await out.close();
    return results.fail({
      message: `laroux build: building ${projectRoot} failed; the "Build failed" log entry above names the step and its error`,
      exitCode: BUILD_FAILED_EXIT_CODE,
    });
  }

  if (analyze) {
    out.writeln(span.cyan("\n📊 Bundle Analysis:\n"));
    try {
      const manifestPath = runtime.path.join(
        buildConfig.distDir,
        "client",
        "manifest.json",
      );
      const manifestText = await runtime.fs.readTextFile(manifestPath);
      const manifest = JSON.parse(manifestText);

      out.writeln(span.text("Chunks:"));
      for (const [file, info] of Object.entries(
        manifest.files as Record<string, { name: string; size: number }>,
      )) {
        const sizeKB = (info.size / 1024).toFixed(2);
        out.writeln(span.text(`  ${file.padEnd(30)} ${sizeKB.padStart(8)} KB`));
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
