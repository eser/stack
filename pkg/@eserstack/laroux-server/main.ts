// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Laroux Server
 * Server orchestration for React Server Components
 *
 * The build runs in @eserstack/laroux-bundler; the CLI commands are in
 * ./commands and mount under `eser laroux` through ./module.ts.
 *
 * @module
 */

import * as logging from "@eserstack/logging";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as system from "@eserstack/laroux-bundler/system";
import type { BuildPlugins } from "@eserstack/laroux-bundler/system";
import * as prebuiltBundler from "@eserstack/laroux-bundler/adapters/prebuilt-bundler";
import type { Bundler } from "@eserstack/laroux-bundler";
import type { BuildConfig } from "@eserstack/laroux-bundler/types";
import type { AppConfig, LogLevel } from "./config/load-config.ts";
import * as loadConfig from "./config/load-config.ts";
import type { ServerOptions } from "./options.ts";
import * as renderer from "./domain/renderer.ts";
import * as htmlShell from "./domain/html-shell.ts";
import * as hmrManager from "./domain/hmr-manager.ts";
import * as rebuildHandler from "./domain/rebuild-handler.ts";
import * as serverModules from "./domain/server-modules.ts";
// NOTE: startHTTPServer is dynamically imported to avoid loading react-dom/server during build
// Type imports are safe since they're erased at compile time
import type { ServerDependencies } from "./runtime/server.ts";

// Re-export types and constants
export type { ServerOptions } from "./options.ts";
export { VALID_LOG_LEVELS } from "./options.ts";
export type { AppComponents } from "./domain/server-modules.ts";

// The ports ServerOptions takes and the types they use, so callers can type
// their own adapters and the documentation has no dangling type references
export type {
  RenderContext,
  Renderer,
  RenderResult,
} from "./domain/renderer.ts";
export type {
  HtmlShellBuilder,
  HtmlShellOptions,
} from "./domain/html-shell.ts";
export type {
  BundleData,
  Bundler,
  ChunkManifest,
  ClientComponent,
  ClientComponentCache,
  ClientComponentCacheEntry,
  ComponentChunkInfo,
  CriticalCssResult,
  CssPlugin,
  CssPluginContext,
  CssProcessor,
  CssProcessorOptions,
  FileInfo,
  FontOptimizationOptions,
  FontOptimizer,
  FrameworkPlugin,
  ImageManifest,
  ImageOptimizationRequest,
  ImageOptimizer,
  ImageVariant,
  ModuleMap,
  ModuleMapEntry,
  OptimizedFonts,
  OptimizedImage,
  TransformResult,
  UniversalCssResult,
} from "@eserstack/laroux-bundler";

/**
 * Thrown by startServer when the build it runs before serving fails, so dev
 * and serve never start on a stale or empty dist/. The bundler logs the
 * failing step and its error before this is thrown.
 */
export class BuildFailedError extends Error {
  /** Root of the app whose build failed */
  readonly projectRoot: string;

  /**
   * Create the error for the app at projectRoot.
   *
   * @param projectRoot - Root of the app whose build failed
   * @param options - Standard error options, such as a `cause`
   */
  constructor(projectRoot: string, options?: ErrorOptions) {
    super(
      `build ${projectRoot}: the bundler build failed, so the server did not start; the "Build failed" log entry above names the step and its error`,
      options,
    );
    this.name = "BuildFailedError";
    this.projectRoot = projectRoot;
  }
}

// Map our LogLevel to @eserstack/logging Severity
const mapLogLevel = (level: LogLevel): logging.Severity => {
  const mapping: Record<LogLevel, logging.Severity> = {
    trace: logging.Severities.Debug,
    debug: logging.Severities.Debug,
    info: logging.Severities.Info,
    warn: logging.Severities.Warning,
    error: logging.Severities.Error,
    fatal: logging.Severities.Critical,
  };
  return mapping[level];
};

// Loggers (initialized in configureLogging)
let serverLogger: logging.logger.Logger;
let bundlerLogger: logging.logger.Logger;

/**
 * Configure logging with the specified level
 */
async function configureLogging(logLevel: LogLevel): Promise<void> {
  const level = mapLogLevel(logLevel);
  const streams = await import("@eserstack/streams");
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  await logging.config.configure({
    sinks: {
      console: logging.sinks.getOutputSink(out),
    },
    loggers: [
      { category: ["laroux-server"], lowestLevel: level, sinks: ["console"] },
      { category: ["laroux-bundler"], lowestLevel: level, sinks: ["console"] },
      { category: ["laroux"], lowestLevel: level, sinks: ["console"] },
    ],
  });

  serverLogger = logging.logger.getLogger(["laroux-server", "server"]);
  bundlerLogger = logging.logger.getLogger(["laroux-server", "bundler"]);
}

/**
 * Convert AppConfig to BuildConfig for the bundler
 */
function toBuildConfig(config: AppConfig): BuildConfig {
  return {
    projectRoot: config.projectRoot,
    srcDir: config.srcDir,
    distDir: config.distDir,
    logLevel: config.logLevel,
    fonts: config.fonts,
    images: config.images,
    cssModuleTypes: config.cssModuleTypes,
    noCssModuleAutoReference: config.noCssModuleAutoReference,
    browserShims: config.browserShims,
    serverExternals: config.build.serverExternals,
  };
}

/**
 * Server dependencies that do not come from the loaded build
 */
type ServerDepsBase = Omit<
  ServerDependencies,
  "getApp" | "getBuildId" | "apiHandler" | "middlewareDispatcher"
>;

/**
 * Load the build in dist/, start watching in dev mode, and start the HTTP
 * server
 */
async function initializeServer(
  deps: ServerDepsBase,
  buildPlugins: BuildPlugins | null,
): Promise<ServerDependencies> {
  const { config, bundler } = deps;
  const hmr = deps.hmrManager ?? null;

  // Fails fast when dist/ holds no build to serve
  const bundle = await bundler.getBundle();
  const buildId = bundle.chunkManifest.buildId;
  bundlerLogger.debug(`Build ID: ${buildId}`);

  const modules = new serverModules.ServerModules(config.distDir);
  await modules.load(buildId);

  const completeDeps: ServerDependencies = {
    ...deps,
    getApp: (pathname) => modules.getApp(pathname),
    getBuildId: () => modules.loadedBuildId(),
    apiHandler: modules.apiRoutes,
    middlewareDispatcher: modules.proxies,
  };

  // Watch mode rebuilds on change, with rolldown like every other build.
  // Only a successful rebuild reaches HMR clients, after the server has
  // loaded the rebuilt pages, API routes, proxies and server actions.
  const isWatching = config.mode.isWatch && buildPlugins !== null;
  if (isWatching) {
    const buildContext = system.createBuildContext(toBuildConfig(config), {
      ...buildPlugins,
      bundlerBackend: "rolldown",
    });
    system.watch(
      buildContext,
      rebuildHandler.createRebuildHandler({
        hmr,
        onRebuilt: (rebuiltBuildId) => modules.load(rebuiltBuildId),
        logger: bundlerLogger,
      }),
    );
  }

  // Display mode indicator
  let modeIndicator = "";
  if (isWatching && hmr !== null) {
    modeIndicator = " HMR";
  } else if (isWatching) {
    modeIndicator = " Watch";
  }

  serverLogger.info(`RSC Server${modeIndicator}`);
  // Dynamically import server module to avoid loading react-dom/server during build
  const server = await import("./runtime/server.ts");
  const listening = await server.startHTTPServer(completeDeps);
  serverLogger.info(`   Local: http://${config.server.host}:${listening.port}`);

  return completeDeps;
}

/**
 * Start the development or production server
 *
 * @param options - Server options (with optional plugin injection)
 * @throws {BuildFailedError} When the build that runs before serving fails;
 *   the server is not started.
 */
export async function startServer(options: ServerOptions): Promise<void> {
  const projectRoot = options.projectRoot ?? crossRuntime.runtime.process.cwd();
  const logLevel = options.logLevel ?? "info";
  const isDev = options.mode === "dev";
  // Build when a framework plugin is given; the other adapters fall back to
  // the bundler's no-op defaults when left out
  const buildPlugins: BuildPlugins | null =
    options.frameworkPlugin !== undefined
      ? {
          framework: options.frameworkPlugin,
          css: options.cssPlugin,
          cssProcessor: options.cssProcessor,
          fontOptimizer: options.fontOptimizer,
          imageOptimizer: options.imageOptimizer,
        }
      : null;

  await configureLogging(logLevel);

  // Load configuration
  const baseConfig = await loadConfig.loadConfig(projectRoot);
  const config: AppConfig = {
    ...baseConfig,
    srcDir: crossRuntime.runtime.path.resolve(projectRoot, baseConfig.srcDir),
    distDir: crossRuntime.runtime.path.resolve(projectRoot, baseConfig.distDir),
    publicDir: crossRuntime.runtime.path.resolve(
      projectRoot,
      baseConfig.publicDir,
    ),
    logLevel,
    mode: {
      isDev,
      isBuild: false,
      isServe: !isDev,
      isWatch: isDev,
    },
  };

  // Apply server options
  if (options.port !== undefined) {
    config.server.port = options.port;
  }
  if (options.hmr !== undefined) {
    config.server.hmr = options.hmr;
  } else if (isDev) {
    config.server.hmr = true; // Default HMR on for dev
  }
  if (options.open !== undefined) {
    config.server.open = options.open;
  }

  // Dev mode adjustments
  if (isDev) {
    config.build.minify = false;
  }

  // Build before serving when a framework plugin is provided: always in dev,
  // and in serve mode when dist/ holds no finished build or a build input
  // changed after it. Dev and serve both bundle with rolldown.
  if (buildPlugins !== null) {
    const context = system.createBuildContext(toBuildConfig(config), {
      ...buildPlugins,
      bundlerBackend: "rolldown",
    });
    const buildResult = isDev
      ? await system.build(context)
      : await system.ensureBuildIsReady(context);
    if (!buildResult.success) {
      // Serving a stale or empty dist/ would hide the failure; the bundler
      // has already logged the failing step and its error.
      throw new BuildFailedError(projectRoot);
    }
  }

  // Set up bundler and HMR
  const bundler: Bundler = new prebuiltBundler.PrebuiltBundler({
    distDir: config.distDir,
  });
  const hmr = isDev && config.server.hmr ? new hmrManager.HMRManager() : null;

  // Start server with explicit plugin injection; the renderer and HTML shell
  // fall back to the noop implementations when none is injected
  await initializeServer(
    {
      config,
      bundler,
      hmrManager: hmr,
      renderer: options.renderer ?? renderer.noopRenderer,
      htmlShell: options.htmlShell ?? htmlShell.noopHtmlShellBuilder,
    },
    buildPlugins,
  );

  // Open browser if requested
  if (options.open === true) {
    openBrowser(`http://localhost:${config.server.port}`);
  }
}

/**
 * Open browser (helper function)
 */
function openBrowser(url: string): void {
  const commands: Readonly<Record<string, readonly [string, ...string[]]>> = {
    darwin: ["open"],
    linux: ["xdg-open"],
    windows: ["cmd", "/c", "start"],
  };

  const platform = crossRuntime.getPlatform();
  const command = commands[platform];

  if (command !== undefined) {
    const [program, ...args] = command;
    crossRuntime.runtime.exec.spawnChild(program, [...args, url], {
      stdout: "null",
      stderr: "null",
    });
  }
}
