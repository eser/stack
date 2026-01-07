// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Laroux Core
 * Server orchestration for React Server Components
 *
 * NOTE: Build functionality is in @eser/laroux-bundler
 * CLI commands are in @eser/cli/commands/laroux/
 */

import * as logging from "@eser/logging";
import { getPlatform, runtime } from "@eser/standards/runtime";
import { JS_FILE_EXTENSIONS } from "@eser/standards/patterns";
import {
  build,
  type BuildResult,
  createBuildContext,
  watch,
} from "@eser/laroux-bundler/system";
import { PrebuiltBundler } from "@eser/laroux-bundler/adapters/prebuilt-bundler";
import { RuntimeBundler } from "@eser/laroux-bundler/adapters/runtime-bundler";
import type {
  Bundler,
  ChunkManifest,
  CssPlugin,
  FrameworkPlugin,
} from "@eser/laroux-bundler";
import type { BuildConfig } from "@eser/laroux-bundler/types";
import type { AppConfig, LogLevel } from "./config/load-config.ts";
import { loadConfig } from "./config/load-config.ts";
import type { ServerOptions } from "./options.ts";
import { noopRenderer } from "./domain/renderer.ts";
import { noopHtmlShellBuilder } from "./domain/html-shell.ts";
import { HMRManager } from "./domain/hmr-manager.ts";
// NOTE: startHTTPServer is dynamically imported to avoid loading react-dom/server during build
// Type imports are safe since they're erased at compile time
import type { ServerDependencies } from "./runtime/server.ts";
import { ApiRouteHandler } from "./domain/route-dispatcher.ts";
import { MiddlewareDispatcher } from "./domain/middleware-dispatcher.ts";
import { findMatchingRoute } from "@eser/laroux/router";
import type { RouteDefinition } from "@eser/laroux/router";

// Re-export types and constants
export type { ServerOptions } from "./options.ts";
export { VALID_LOG_LEVELS } from "./options.ts";

// Constants
const MANIFEST_FILENAME = "manifest.json";

// Map our LogLevel to @eser/logging Severity
const mapLogLevel = (level: LogLevel): logging.Severity => {
  const mapping: Record<LogLevel, logging.Severity> = {
    "trace": logging.Severities.Debug,
    "debug": logging.Severities.Debug,
    "info": logging.Severities.Info,
    "warn": logging.Severities.Warning,
    "error": logging.Severities.Error,
    "fatal": logging.Severities.Critical,
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
  await logging.config.configure({
    sinks: {
      console: logging.sinks.getConsoleSink({
        formatter: logging.formatters.ansiColorFormatter(),
      }),
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
 * Result of loading app components for a given pathname
 */
export type AppComponents = {
  // deno-lint-ignore no-explicit-any
  Layout: any;
  // deno-lint-ignore no-explicit-any
  Page: any;
  params: Record<string, string | string[]>;
};

// Cache for routes
let cachedRoutes: RouteDefinition[] | null = null;

/**
 * Clear routes cache (called on HMR updates)
 */
export function clearRoutesCache(): void {
  cachedRoutes = null;
}

/**
 * Load routes from the generated routes file.
 * Routes are generated at build time to ${distDir}/server/_generated-routes.ts
 */
async function loadRoutes(config: AppConfig): Promise<RouteDefinition[]> {
  if (cachedRoutes !== null) {
    return cachedRoutes;
  }

  // Load directly from the generated routes file
  // Path is constructed from config - no hardcoded directory names
  const generatedRoutesPath = runtime.path.join(
    config.distDir,
    "server",
    "_generated-routes.ts",
  );

  // Cache-bust for HMR
  const routesImportPath = `file://${generatedRoutesPath}?t=${Date.now()}`;

  // @ts-ignore - Dynamic import
  const { generatedRoutes } = await import(routesImportPath);
  cachedRoutes = generatedRoutes;
  return generatedRoutes;
}

/**
 * Resolve server component import path.
 * Prefers bundled .js files (dist/server/app/*.js) over source files (dist/server/src/app/*).
 * Bundled files have all imports resolved, while source files may have bare imports.
 *
 * @param config - App configuration
 * @param baseName - Base file name without extension (e.g., "layout", "not-found")
 * @returns Resolved path to the component file
 */
async function resolveServerComponentPath(
  config: AppConfig,
  baseName: string,
): Promise<string> {
  // First try bundled .js file
  const bundledPath = runtime.path.resolve(
    config.distDir,
    "server",
    "app",
    `${baseName}.js`,
  );

  const bundledExists = await runtime.fs.exists(bundledPath);
  if (bundledExists) {
    return bundledPath;
  }

  // Fall back to source file - try each extension
  for (const ext of JS_FILE_EXTENSIONS) {
    const sourcePath = runtime.path.resolve(
      config.distDir,
      "server",
      "src",
      "app",
      `${baseName}.${ext}`,
    );
    const sourceExists = await runtime.fs.exists(sourcePath);
    if (sourceExists) {
      return sourcePath;
    }
  }

  // Return the bundled path as default (will fail with clear error)
  return bundledPath;
}

/**
 * Load app components (Layout + Page) for a given pathname
 */
async function loadAppComponents(
  pathname: string,
  config: AppConfig,
): Promise<AppComponents> {
  const timestamp = Date.now();

  // Load Layout component - prefer bundled file
  const layoutPath = await resolveServerComponentPath(config, "layout");
  const layoutImportPath = `file://${layoutPath}?t=${timestamp}`;
  // @ts-ignore - Dynamic import
  const { Layout } = await import(layoutImportPath);

  // Load routes and find matching route
  const routes = await loadRoutes(config);
  const match = findMatchingRoute(pathname, routes);

  if (match === null) {
    const notFoundPath = await resolveServerComponentPath(
      config,
      "not-found",
    );
    const notFoundImportPath = `file://${notFoundPath}?t=${timestamp}`;
    // @ts-ignore - Dynamic import
    const { NotFound } = await import(notFoundImportPath);
    return { Layout, Page: NotFound, params: {} };
  }

  return {
    Layout,
    Page: match.route.component,
    params: match.params,
  };
}

/**
 * Load build ID from chunk manifest
 */
async function loadBuildId(config: AppConfig): Promise<string> {
  try {
    const chunkManifestPath = runtime.path.resolve(
      config.distDir,
      "client",
      MANIFEST_FILENAME,
    );
    const manifestContent = await runtime.fs.readTextFile(chunkManifestPath);
    const manifest: ChunkManifest = JSON.parse(manifestContent);
    return manifest.buildId;
  } catch {
    return "unknown";
  }
}

/**
 * Check if build is up to date
 */
async function isBuildUpToDate(config: AppConfig): Promise<boolean> {
  try {
    const manifestPath = runtime.path.resolve(
      config.distDir,
      "client",
      MANIFEST_FILENAME,
    );
    const manifestStat = await runtime.fs.stat(manifestPath);
    const srcStat = await runtime.fs.stat(config.srcDir);
    if (manifestStat.mtime === null || srcStat.mtime === null) {
      return false;
    }
    return manifestStat.mtime > srcStat.mtime;
  } catch {
    return false;
  }
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
 * Plugin options for build context creation
 */
type PluginOptions = {
  frameworkPlugin?: FrameworkPlugin;
  cssPlugin?: CssPlugin;
};

/**
 * Server dependencies container (duplicated here to avoid importing from runtime/server.ts)
 * The actual type is imported dynamically when needed
 */
type ServerDepsBase = {
  config: AppConfig;
  bundler: Bundler;
  hmrManager?: HMRManager | null;
  apiHandler?: ApiRouteHandler;
  middlewareDispatcher?: MiddlewareDispatcher;
  // deno-lint-ignore no-explicit-any
  renderer?: any;
  // deno-lint-ignore no-explicit-any
  htmlShell?: any;
  // deno-lint-ignore no-explicit-any
  rateLimitConfig?: any;
};

/**
 * Initialize and start the HTTP server
 */
async function initializeServer(
  deps: ServerDepsBase,
  pluginOptions: PluginOptions = {},
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const { config, bundler, hmrManager } = deps;
  const { frameworkPlugin, cssPlugin } = pluginOptions;

  // Load server actions from manifest (generated during build)
  // The manifest lists all files with "use server" directive
  try {
    const manifestPath = runtime.path.resolve(
      config.distDir,
      "server",
      "actions-manifest.json",
    );
    const manifestExists = await runtime.fs.exists(manifestPath);
    if (manifestExists) {
      const manifestContent = await runtime.fs.readTextFile(manifestPath);
      const manifest: { actions: string[] } = JSON.parse(manifestContent);
      const timestamp = Date.now();
      let loadedCount = 0;

      for (const actionPath of manifest.actions) {
        try {
          // Action paths preserve full structure like "src/app/actions.js"
          // Bundler outputs to dist/server/src/app/actions.js (no path stripping)
          const fullPath = runtime.path.resolve(
            config.distDir,
            "server",
            actionPath,
          );
          const actionExists = await runtime.fs.exists(fullPath);
          if (actionExists) {
            const actionImportPath = `file://${fullPath}?t=${timestamp}`;
            await import(actionImportPath);
            loadedCount++;
          }
        } catch (error) {
          serverLogger.warn(`Failed to load action ${actionPath}:`, { error });
        }
      }

      if (loadedCount > 0) {
        serverLogger.debug(`Server actions loaded: ${loadedCount} file(s)`);
      }
    } else {
      serverLogger.debug("No actions manifest found (optional)");
    }
  } catch (error) {
    serverLogger.warn("Failed to load server actions:", { error });
  }

  // Load initial components
  await loadAppComponents("/", config);
  const buildId = await loadBuildId(config);
  bundlerLogger.debug(`Build ID: ${buildId}`);

  const getApp = (pathname: string) => loadAppComponents(pathname, config);
  const completeDeps: ServerDependencies = {
    ...deps,
    getApp,
    buildId,
  };

  // Initialize bundler
  const bundle = await bundler.getBundle();

  // Build context plugins - use injected plugins if available
  const buildContextPlugins = {
    framework: frameworkPlugin,
    css: cssPlugin,
    bundlerBackend: "deno-bundler" as const,
  };

  if (bundle.clientCode !== null && hmrManager !== null) {
    // Dev mode with HMR - start watcher (only if plugins provided)
    if (frameworkPlugin !== undefined) {
      const buildContext = createBuildContext(
        toBuildConfig(config),
        buildContextPlugins,
      );
      watch(buildContext, async (result: BuildResult) => {
        if (bundler instanceof RuntimeBundler) {
          try {
            await bundler.rebuild();
          } catch (error) {
            bundlerLogger.error("Compilation failed:", { error });
          }
        }

        bundlerLogger.info(`✓ Compiled in ${result.duration.toFixed(0)}ms`);

        if (hmrManager !== null && hmrManager !== undefined) {
          hmrManager.notifyUpdate(Date.now(), result.changedFiles);
        }
      });
    }
  } else if (config.mode.isWatch && frameworkPlugin !== undefined) {
    // Watch mode without HMR
    const buildContext = createBuildContext(
      toBuildConfig(config),
      buildContextPlugins,
    );
    watch(buildContext, (result: BuildResult) => {
      bundlerLogger.info(`✓ Compiled in ${result.duration.toFixed(0)}ms`);
    });
  }

  // Display mode indicator
  let modeIndicator = "";
  if (bundle.clientCode !== null && hmrManager !== null) {
    modeIndicator = " HMR";
  } else if (bundle.clientCode !== null) {
    modeIndicator = " Watch";
  }

  serverLogger.info(`RSC Server${modeIndicator}`);
  serverLogger.info(`   Local: http://localhost:${config.server.port}`);

  // Dynamically import server module to avoid loading react-dom/server during build
  const { startHTTPServer } = await import("./runtime/server.ts");
  startHTTPServer(completeDeps);

  return completeDeps;
}

/**
 * Start the development or production server
 *
 * @param options - Server options (with optional plugin injection)
 */
export async function startServer(options: ServerOptions): Promise<void> {
  const projectRoot = options.projectRoot ?? runtime.process.cwd();
  const logLevel = options.logLevel ?? "info";
  const isDev = options.mode === "dev";
  const { renderer, htmlShell, frameworkPlugin, cssPlugin } = options;

  await configureLogging(logLevel);

  // Load configuration
  const baseConfig = await loadConfig(projectRoot);
  const config: AppConfig = {
    ...baseConfig,
    srcDir: runtime.path.resolve(projectRoot, baseConfig.srcDir),
    distDir: runtime.path.resolve(projectRoot, baseConfig.distDir),
    publicDir: runtime.path.resolve(projectRoot, baseConfig.publicDir),
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

  // Determine if build is needed
  const buildUpToDate = await isBuildUpToDate(config);
  const shouldBuild = isDev || !buildUpToDate;

  // Build context plugins - use injected plugins
  const buildContextPlugins = {
    framework: frameworkPlugin,
    css: cssPlugin,
  };

  // For dev mode, do initial build (only if plugins provided)
  if (shouldBuild && isDev && frameworkPlugin !== undefined) {
    const context = createBuildContext(toBuildConfig(config), {
      ...buildContextPlugins,
      bundlerBackend: "deno-bundler",
    });
    await build(context);
  } else if (shouldBuild && frameworkPlugin !== undefined) {
    // Production serve needs a build if out of date
    const context = createBuildContext(toBuildConfig(config), {
      ...buildContextPlugins,
      bundlerBackend: "rolldown",
    });
    await build(context);
  }

  // Set up bundler and HMR
  let bundler: Bundler;
  let hmrManager: HMRManager | null = null;

  if (isDev && config.server.hmr) {
    hmrManager = new HMRManager();
    bundler = new PrebuiltBundler({ distDir: config.distDir });
  } else {
    bundler = new PrebuiltBundler({ distDir: config.distDir });
  }

  // Initialize handlers
  const apiHandler = new ApiRouteHandler();
  await apiHandler.loadRoutes(config.distDir);

  const middlewareDispatcher = new MiddlewareDispatcher();
  await middlewareDispatcher.loadProxies(config.distDir);

  // Use injected renderer/htmlShell or fall back to noop implementations
  const activeRenderer = renderer ?? noopRenderer;
  const activeHtmlShell = htmlShell ?? noopHtmlShellBuilder;

  // Start server with explicit plugin injection
  await initializeServer(
    {
      config,
      bundler,
      hmrManager,
      apiHandler,
      middlewareDispatcher,
      renderer: activeRenderer,
      htmlShell: activeHtmlShell,
    },
    { frameworkPlugin, cssPlugin },
  );

  // Open browser if requested
  if (options.open) {
    openBrowser(`http://localhost:${config.server.port}`);
  }
}

/**
 * Open browser (helper function)
 */
function openBrowser(url: string): void {
  const commands: Record<string, string[]> = {
    darwin: ["open"],
    linux: ["xdg-open"],
    windows: ["cmd", "/c", "start"],
  };

  const platform = getPlatform();
  const command = commands[platform];

  if (command && command[0]) {
    runtime.exec.spawnChild(command[0], [...command.slice(1), url], {
      stdout: "null",
      stderr: "null",
    });
  }
}
