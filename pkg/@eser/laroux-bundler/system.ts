// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Unified Build System
 *
 * Framework-agnostic build orchestration.
 * Framework-specific functionality (like React Server Components) is provided
 * through the FrameworkPlugin interface.
 */

import { type FsWatcher, runtime, toPosix } from "@eser/standards/runtime";
import * as logging from "@eser/logging";
import * as pkg from "@eser/codebase/package";
import { analyzeServerActions } from "@eser/codebase/directive-analysis";
import { JS_FILE_PATTERN, replaceJsExtension } from "@eser/standards/patterns";
import { transformServerActions } from "./domain/server-action-transform.ts";
import { generateClientActionStubs } from "./domain/client-action-stub.ts";

const buildLogger = logging.logger.getLogger(["laroux-bundler", "build"]);

import { copy } from "@std/fs"; // copy not available in runtime
import { ulid } from "@std/ulid";
import type {
  ClientComponent,
  FrameworkPlugin,
  ModuleMap,
} from "./domain/framework-plugin.ts";
import { noopPlugin } from "./domain/framework-plugin.ts";
import type { BundlerBackend } from "./config.ts";
import type { BuildConfig, FontDefinition } from "./types.ts";
import type { ChunkManifest } from "./domain/chunk-manifest.ts";
import { processCss } from "./adapters/lightningcss/mod.ts";
import type { CssPlugin } from "./domain/css-plugin.ts";
import type { CSSModuleResult } from "./css-modules.ts";
import { createImportMapResolverPlugin } from "./import-map-resolver-plugin.ts";
import { scanRoutes } from "./domain/route-scanner.ts";
import {
  generateApiRouteFile,
  generateProxyFile,
  generateRouteFile,
} from "./domain/route-generator.ts";
import {
  createVirtualSource,
  translateClientComponents,
  translateToVirtualPath,
} from "./domain/virtual-source.ts";
import { type BuildCache, getGlobalBuildCache } from "./domain/build-cache.ts";
import {
  bundle,
  bundleServerComponents,
  logBundleStats,
} from "./domain/bundler.ts";
import {
  generateChunkManifest,
  logManifest,
  saveChunkManifest,
} from "./domain/chunk-manifest.ts";
import { PRODUCTION_SETTINGS } from "./config.ts";
import { getFontUrls, optimizeGoogleFonts } from "./adapters/fonts/mod.ts";
import { processCSSModules, saveCSSModuleOutputs } from "./css-modules.ts";
import { createServerExternalsPlugin } from "./server-externals-plugin.ts";

// Constants
const MANIFEST_FILENAME = "manifest.json";
const MODULE_MAP_FILENAME = "module-map.json";
const SERVER_DIR = "server";
const CLIENT_DIR = "client";

/**
 * Build context with all necessary dependencies
 */
export type BuildContext = {
  /** Build configuration */
  config: BuildConfig;
  /** Project root directory */
  projectRoot: string;
  /** Source directory */
  srcDir: string;
  /** Distribution/output directory */
  distDir: string;
  /** Client entry point path */
  clientEntry: string;
  /** Chunk manifest file path */
  chunkManifestFile: string;
  /** Build cache for incremental builds (watch mode) */
  cache?: BuildCache;
  /** Bundler backend to use (default: "deno-bundler") */
  bundlerBackend?: BundlerBackend;
  /** Framework plugin for framework-specific build functionality */
  plugin: FrameworkPlugin;
  /** CSS plugin for CSS processing (Tailwind, UnoCSS, etc.) */
  cssPlugin?: CssPlugin;
};

/**
 * Result of a build operation
 */
export type BuildResult = {
  /** Whether the build succeeded */
  success: boolean;
  /** Path to the client bundle */
  clientBundle: string;
  /** Module map for client components */
  moduleMap: ModuleMap;
  /** Number of client components found */
  clientComponents: number;
  /** Build duration in milliseconds */
  duration: number;
  /** Build timestamp */
  timestamp: number;
  /** Files that changed (for watch mode HMR) */
  changedFiles?: string[];
};

/**
 * Build plugins configuration
 * Users pass these explicitly when calling bundle functions
 */
export type BuildPlugins = {
  /** Framework plugin for framework-specific build functionality (React, Vue, etc.) */
  framework?: FrameworkPlugin;
  /** CSS plugin for CSS processing (Tailwind, UnoCSS, etc.) */
  css?: CssPlugin;
  /** Bundler backend to use (default: "deno-bundler") */
  bundlerBackend?: BundlerBackend;
};

/**
 * Create build context from configuration
 * @param config - Build configuration
 * @param plugins - Plugins for framework, CSS, and bundler (explicit composition)
 * @returns Build context with all paths and dependencies
 */
export function createBuildContext(
  config: BuildConfig,
  plugins?: BuildPlugins,
): BuildContext {
  const projectRoot = config.projectRoot;
  const srcDir = config.srcDir;
  const distDir = config.distDir;
  // Client entry is no longer hardcoded - provided by the plugin
  const clientEntry = "";
  const chunkManifestFile = runtime.path.resolve(distDir, MANIFEST_FILENAME);

  return {
    config,
    projectRoot,
    srcDir,
    distDir,
    clientEntry,
    chunkManifestFile,
    bundlerBackend: plugins?.bundlerBackend,
    plugin: plugins?.framework ?? noopPlugin,
    cssPlugin: plugins?.css,
  };
}

/**
 * Main build function
 * Performs complete build: analyze → transform → bundle → generate maps
 * @param context - Build context with configuration and paths
 * @param options - Build options
 *   - skipCss: skip CSS processing for JS-only changes
 *   - cssOnly: only process CSS, skip all JS steps (for CSS-only HMR)
 *   - changedFiles: set of changed file paths for incremental builds
 * @returns Build result with success status and metrics
 */
export async function build(
  context: BuildContext,
  options?: {
    skipCss?: boolean;
    cssOnly?: boolean;
    changedFiles?: Set<string>;
  },
): Promise<BuildResult> {
  const { srcDir, distDir, projectRoot } = context;
  const startTime = performance.now();

  // Generate unique build ID
  const buildId = ulid();

  buildLogger.info(`🚀 Starting RSC build...`);
  buildLogger.debug(`🆔 Build ID: ${buildId}`);

  try {
    // CSS-only fast path for HMR - skip all JS steps
    if (options?.cssOnly) {
      buildLogger.debug("⚡ CSS-only rebuild (fast path)");
      const buildTimestamp = Date.now();
      const clientOutputDir = runtime.path.resolve(distDir, CLIENT_DIR);

      // Use provided CSS plugin or skip CSS processing if none
      const cssPlugin = context.cssPlugin;
      if (!cssPlugin) {
        buildLogger.warn("⚠️  No CSS plugin provided, skipping CSS processing");
        return {
          success: true,
          clientBundle: "",
          moduleMap: {},
          clientComponents: 0,
          duration: performance.now() - startTime,
          timestamp: buildTimestamp,
        };
      }

      // Scan CSS modules once for this build
      const cssModulePaths = await scanCssModuleFiles(srcDir);

      // Only process CSS files
      await processCssFiles(cssPlugin, srcDir, projectRoot, clientOutputDir);

      // Process CSS Modules (pass pre-scanned paths and cache)
      if (cssModulePaths.length > 0) {
        await processCssModulesFiles(
          projectRoot,
          clientOutputDir,
          context.config,
          { cssModulePaths, cache: context.cache },
        );
      }

      const duration = performance.now() - startTime;
      buildLogger.info(`⚡ CSS rebuild completed (${duration.toFixed(0)}ms)`);

      return {
        success: true,
        clientBundle: "", // Preserved from previous build
        moduleMap: {}, // Preserved from previous build
        clientComponents: 0,
        duration,
        timestamp: buildTimestamp,
      };
    }

    // Step 1: Clean if requested (preserve CSS files when skipCss is true)
    await cleanBuildDir(distDir, options?.skipCss);

    // Step 2: Ensure dist directory exists
    await runtime.fs.ensureDir(distDir);

    // Build timestamp will be written to chunk manifest at the end
    const buildTimestamp = Date.now();

    // Step 3: Parallel scan - routes, client components, and CSS modules
    // These operations are independent and can run concurrently for faster builds
    buildLogger.debug(
      "🔍 Step 3: Parallel scanning (routes, components, CSS modules)...",
    );
    const routesDir = runtime.path.resolve(srcDir, "app/routes");
    const { plugin } = context;
    const [scanResult, clientComponents, cssModulePaths] = await Promise.all([
      scanRoutes(routesDir, projectRoot),
      plugin.analyzeClientComponents
        ? plugin.analyzeClientComponents(srcDir, projectRoot, context.cache)
        : Promise.resolve([]),
      scanCssModuleFiles(srcDir),
    ]);

    // Generate route files to dist/server/ (NOT src/) for build isolation
    const serverDir = runtime.path.resolve(distDir, SERVER_DIR);
    await runtime.fs.ensureDir(serverDir);
    const generatedRoutesPath = runtime.path.resolve(
      serverDir,
      "_generated-routes.ts",
    );
    // Get srcDir name relative to project root (e.g., "src")
    const srcDirName = runtime.path.relative(projectRoot, srcDir);
    await generateRouteFile({
      scanResult,
      outputPath: generatedRoutesPath,
      projectRoot,
      srcDirName,
    });
    buildLogger.debug(
      `✓ Generated ${scanResult.routes.length} page route(s) to dist/`,
    );

    // Generate API routes file if any exist
    if (scanResult.apiRoutes.length > 0) {
      const apiRoutesPath = runtime.path.resolve(
        distDir,
        "server",
        "api-routes.ts",
      );
      await runtime.fs.ensureDir(runtime.path.dirname(apiRoutesPath));
      await generateApiRouteFile(scanResult, apiRoutesPath, projectRoot);
      buildLogger.debug(
        `✓ Generated ${scanResult.apiRoutes.length} API route(s)`,
      );
    }

    // Generate proxy registry if any exist
    if (scanResult.proxies.length > 0) {
      const proxyPath = runtime.path.resolve(
        distDir,
        "server",
        "proxy-registry.ts",
      );
      await runtime.fs.ensureDir(runtime.path.dirname(proxyPath));
      await generateProxyFile(scanResult, proxyPath, projectRoot);
      buildLogger.debug(
        `✓ Generated ${scanResult.proxies.length} proxy definition(s)`,
      );
    }

    if (clientComponents.length === 0) {
      buildLogger.warn("⚠️  Warning: No client components found!");
    }

    // Step 4: Transform client components (proxies)
    buildLogger.debug("🔄 Step 4: Transforming client components...");
    const transformResults = plugin.transformClientComponents
      ? await plugin.transformClientComponents(
        clientComponents,
        runtime.path.resolve(distDir, SERVER_DIR),
        projectRoot,
      )
      : [];

    // Generate transform manifest
    if (plugin.generateTransformManifest) {
      await plugin.generateTransformManifest(
        transformResults,
        runtime.path.resolve(distDir, "transform-manifest.json"),
        projectRoot,
      );
    }

    // Step 5: Rewrite server component imports
    buildLogger.debug(
      "✏️  Step 5: Rewriting server component imports...",
    );
    const allComponents = plugin.getAllComponents
      ? await plugin.getAllComponents(srcDir)
      : [];
    const clientComponentPaths = new Set(
      clientComponents.map((c) => c.filePath),
    );
    const serverComponentPaths = allComponents.filter((path) =>
      !clientComponentPaths.has(path)
    );

    if (plugin.rewriteServerComponents) {
      await plugin.rewriteServerComponents(
        serverComponentPaths,
        transformResults,
        cssModulePaths,
        runtime.path.resolve(distDir, SERVER_DIR),
        projectRoot,
      );
    }

    // Step 5b: Transform server actions to add React server reference symbols
    // This must happen AFTER server components are copied but BEFORE bundling
    buildLogger.debug(
      "🔄 Step 5b: Transforming server actions with React symbols...",
    );
    const serverDistDir = runtime.path.resolve(distDir, SERVER_DIR);
    const serverActionResults = await transformServerActions(serverDistDir);
    if (serverActionResults.length > 0) {
      const totalActions = serverActionResults.reduce(
        (sum, r) => sum + r.transformedActions.length,
        0,
      );
      buildLogger.info(
        `   ✅ Transformed ${serverActionResults.length} file(s) with ${totalActions} action(s)`,
      );
    }

    // Step 6: Generate module map
    buildLogger.debug("🗺️  Step 6: Generating module map...");
    const clientOutputDir = runtime.path.resolve(distDir, CLIENT_DIR);
    await runtime.fs.ensureDir(clientOutputDir);

    const moduleMap = plugin.createModuleMap
      ? await plugin.createModuleMap(clientComponents)
      : {};
    if (plugin.saveModuleMap) {
      await plugin.saveModuleMap(
        moduleMap,
        runtime.path.resolve(clientOutputDir, MODULE_MAP_FILENAME),
      );
    }

    if (plugin.createClientManifest) {
      await plugin.createClientManifest(clientComponents);
    }

    // Use provided CSS plugin (or skip CSS if none)
    const cssPlugin = context.cssPlugin;

    // Step 7: Process global CSS with CSS plugin (skippable for JS-only changes)
    if (!options?.skipCss && cssPlugin) {
      buildLogger.debug(
        "🎨 Step 7: Processing CSS with CSS plugin + Lightning CSS...",
      );
      await processCssFiles(cssPlugin, srcDir, projectRoot, clientOutputDir);
    } else if (!cssPlugin) {
      buildLogger.debug("⏭️  No CSS plugin provided, skipping CSS processing");
    } else {
      buildLogger.debug("⏭️  Skipping CSS processing (JS-only change)");
    }

    // Step 8: Create virtual source for bundling (build isolation)
    // This copies src/ to dist/_bundle_src/ so we can modify imports without touching original source
    // In watch mode, only copy changed files for faster rebuilds
    buildLogger.debug("📁 Step 8: Creating virtual source for bundling...");
    const virtualSource = await createVirtualSource({
      projectRoot,
      distDir,
      srcDir,
      changedFiles: options?.changedFiles,
    });
    const virtualSrcDir = virtualSource.virtualSrcDir;

    // Step 8b: Generate client stubs for "use server" files in virtual source
    // This replaces server action files with client-side stubs that call /action
    // Must happen BEFORE client bundling so imports resolve to stubs
    buildLogger.debug(
      "🔌 Step 8b: Generating client action stubs in virtual source...",
    );
    const virtualSrcSubdirForStubs = runtime.path.join(
      virtualSrcDir,
      srcDirName,
    );
    const clientStubResults = await generateClientActionStubs(
      virtualSrcSubdirForStubs,
      virtualSrcDir,
    );
    if (clientStubResults.length > 0) {
      const totalActions = clientStubResults.reduce(
        (sum, r) => sum + r.exportedActions.length,
        0,
      );
      buildLogger.info(
        `   ✅ Generated ${clientStubResults.length} stub file(s) with ${totalActions} action(s)`,
      );
    }

    // Step 9: Process CSS Modules to virtual source (NOT original src/)
    // Generate JSON files in the virtual source directory
    // Map to store pre-processed CSS module results (translated to original paths)
    let cssModuleResults: Map<string, CSSModuleResult> | undefined;

    if (!options?.skipCss) {
      buildLogger.debug(
        "🎨 Step 9: Processing CSS Modules to virtual source...",
      );

      // Translate CSS module paths to virtual source
      const virtualCssModulePaths = cssModulePaths.map((p) =>
        translateToVirtualPath(p, srcDir, virtualSrcDir)
      );

      // Process and generate JSON files in virtual source
      // Use real projectRoot for Tailwind (needs node_modules for @import "tailwindcss")
      // Pass pre-translated virtual paths to avoid redundant scan
      const virtualResults = await processCssModulesFiles(
        projectRoot,
        virtualSrcDir,
        context.config,
        {
          skipCss: true,
          cssModulePaths: virtualCssModulePaths,
          cache: context.cache,
        },
      );

      // Translate virtual paths back to original paths for reuse in appendCssModulesToStyles
      // This avoids duplicate CSS module processing
      cssModuleResults = new Map();
      // Use srcDirName computed from config (e.g., "src") for virtual path translation
      const virtualSrcSubdir = runtime.path.join(virtualSrcDir, srcDirName);
      for (const [virtualPath, result] of virtualResults) {
        // Convert virtual path back to original path
        const relativePath = runtime.path.relative(
          virtualSrcSubdir,
          virtualPath,
        );
        const originalPath = runtime.path.resolve(srcDir, relativePath);
        cssModuleResults.set(originalPath, result);
      }

      // Rewrite CSS imports in virtual source (NOT original src/)
      if (virtualCssModulePaths.length > 0) {
        buildLogger.debug(
          "✏️  Step 10: Rewriting CSS module imports in virtual source...",
        );
        if (plugin.rewriteCssModuleImports) {
          await plugin.rewriteCssModuleImports(
            virtualSrcSubdir,
            virtualCssModulePaths,
            projectRoot,
          );
        }
      }
    }

    // Step 11: Bundle client code from virtual source
    // Translate component paths to use virtual source
    buildLogger.debug(
      "📦 Step 11: Bundling client code from virtual source...",
    );
    const virtualClientComponents = translateClientComponents(
      clientComponents,
      srcDir,
      virtualSrcDir,
    );
    const clientBundle = await bundleClient(
      { ...context, srcDir: virtualSrcDir },
      virtualClientComponents,
      buildId,
      buildTimestamp,
    );

    // Step 12: Copy CSS Module JSON files from virtual source to dist/
    if (!options?.skipCss && cssModulePaths.length > 0) {
      // Copy JSON files from virtual source to dist/client/
      buildLogger.debug(
        `📋 Step 12: Copying ${cssModulePaths.length} CSS Module JSON file(s) to client/...`,
      );
      await copyCssModuleJsonFilesFromSrc(
        cssModulePaths.map((p) =>
          translateToVirtualPath(p, srcDir, virtualSrcDir)
        ),
        virtualSrcDir,
        clientOutputDir,
      );

      // Copy JSON files from virtual source to dist/server/
      buildLogger.debug(
        `📋 Step 13: Copying ${cssModulePaths.length} CSS Module JSON file(s) to server/...`,
      );
      await copyCssModuleJsonFilesFromSrc(
        cssModulePaths.map((p) =>
          translateToVirtualPath(p, srcDir, virtualSrcDir)
        ),
        virtualSrcDir,
        runtime.path.resolve(distDir, SERVER_DIR),
      );

      // Append CSS module styles to main styles.css bundle
      // Pass pre-processed results to avoid duplicate processing
      buildLogger.debug("🎨 Step 14: Appending CSS modules to styles.css...");
      await appendCssModulesToStyles(
        cssModulePaths,
        projectRoot,
        clientOutputDir,
        cssModuleResults,
      );
    }

    // Step 15: Clean up virtual source
    buildLogger.debug("🧹 Step 15: Cleaning up virtual source...");
    await virtualSource.cleanup();

    // Step 16: Extract critical CSS for faster initial render (requires CSS plugin)
    if (cssPlugin) {
      buildLogger.debug("✨ Step 16: Extracting critical CSS...");
      const criticalCssResult = await extractCriticalPageCssFiles(
        cssPlugin,
        clientOutputDir,
      );
      if (criticalCssResult) {
        buildLogger.debug(
          `   Critical: ${criticalCssResult.criticalPath}, Deferred: ${criticalCssResult.deferredPath}`,
        );
      }

      // Step 17: Generate universal CSS (base/theme styles)
      buildLogger.debug("🎨 Step 17: Generating universal CSS...");
      const universalCssPath = await generateCriticalUniversalCssFile(
        cssPlugin,
        clientOutputDir,
      );
      if (universalCssPath) {
        buildLogger.debug(`   Universal: ${universalCssPath}`);
      }
    }

    // Step 18: Optimize fonts for self-hosting (output to client/)
    buildLogger.debug("🔤 Step 18: Optimizing Fonts...");
    await optimizeFonts(clientOutputDir, context.config.fonts);

    // Step 19: Optimize images (WebP, AVIF, responsive variants)
    buildLogger.debug("🖼️  Step 19: Optimizing Images...");
    await optimizeImagesStep(projectRoot, clientOutputDir, context.config);

    // Step 20: Copy translation JSON files to server directory
    buildLogger.debug("🌐 Step 20: Copying translation files...");
    await copyTranslationFiles(
      srcDir,
      runtime.path.resolve(distDir, SERVER_DIR),
      projectRoot,
    );

    // Step 21: Copy import maps to dist/server for dev mode dynamic imports
    // In dev mode, Deno dynamically imports files from dist/server.
    // These files have bare imports (e.g., "lucide-react") that need resolution.
    // Copying the project's config files ensures import maps apply.
    const serverOutputDir = runtime.path.resolve(distDir, SERVER_DIR);
    await copyConfigFilesWithImportMaps(projectRoot, serverOutputDir);

    // Step 22: Bundle server components
    // This resolves all bare specifiers (react, lucide-react, etc.) via the bundler
    // instead of manual rewriting to npm: specifiers (which breaks Node.js)
    // NOTE: Always use rolldown for server bundling because deno-bundler doesn't support
    // custom resolver plugins needed for npm: specifiers
    buildLogger.info(
      `📦 Step 22: Server bundling check - components: ${serverComponentPaths.length}`,
    );
    if (serverComponentPaths.length > 0) {
      buildLogger.info(
        `📦 Step 22: Bundling ${serverComponentPaths.length} server component(s) with rolldown...`,
      );

      // Get server component files from dist/server (already copied with rewrites)
      // Files are in dist/server/src/... (preserving source directory structure)
      const serverEntrypoints: string[] = [];
      for (const srcPath of serverComponentPaths) {
        // Get path relative to project root (e.g., "src/app/page.tsx")
        const relativePath = runtime.path.relative(projectRoot, srcPath);
        // Join with serverOutputDir (e.g., "dist/server/src/app/page.tsx")
        const distPath = runtime.path.join(serverOutputDir, relativePath);
        const exists = await runtime.fs.exists(distPath);
        if (exists) {
          serverEntrypoints.push(distPath);
        }
      }

      buildLogger.info(
        `   Found ${serverEntrypoints.length} server entrypoints to bundle`,
      );

      if (serverEntrypoints.length > 0) {
        // Server externals from config (default: @eser/laroux, @eser/laroux-server)
        // These resolve from the app's node_modules at runtime.
        // Everything else (react, lucide-react, etc.) gets bundled.
        // See ADR: 0002-bundler-external-import-specifiers.md
        const serverExternals = context.config.serverExternals;

        // Create server externals plugin with prefix matching for subpath imports
        // e.g., "@eser/laroux-server" matches "@eser/laroux-server/action-registry"
        // This ensures singleton modules like action-registry are shared between
        // bundled server components and the laroux-server runtime.
        const serverExternalsPlugin = createServerExternalsPlugin({
          externals: serverExternals,
        });

        // Use the configured bundler backend for server bundling
        // - deno-bundler: outputs browser-targeted ESM, but works in Deno runtime
        // - rolldown: supports platform: "node" for Node.js-compatible output
        const serverBundleResult = await bundleServerComponents(
          {
            entrypoints: serverEntrypoints,
            outputDir: serverOutputDir,
            projectRoot: serverOutputDir,
            sourcemap: false,
            minify: false,
            externals: serverExternals,
            plugins: [serverExternalsPlugin],
          },
          context.bundlerBackend ?? "deno-bundler",
        );

        buildLogger.info(
          `   ✅ Bundled ${serverBundleResult.fileCount} server file(s)`,
        );
      }
    }

    // Step 22b: Generate server actions manifest
    // Use analyzeServerActions which scans ALL files for "use server" directive
    // This finds action files regardless of naming (not just actions.ts)
    buildLogger.debug("📋 Step 22b: Generating server actions manifest...");
    const serverActionMatches = await analyzeServerActions(srcDir, {
      projectRoot,
    });
    // Convert source paths to bundled output paths:
    // Preserves full path structure (src/app/actions.ts → src/app/actions.js)
    const actionFiles = serverActionMatches.map((match) =>
      replaceJsExtension(match.relativePath, ".js")
    );

    // Write actions manifest
    const actionsManifestPath = runtime.path.resolve(
      serverOutputDir,
      "actions-manifest.json",
    );
    await runtime.fs.writeTextFile(
      actionsManifestPath,
      JSON.stringify({ actions: actionFiles }, null, 2),
    );
    buildLogger.debug(
      `✓ Generated actions manifest: ${actionFiles.length} action file(s)`,
    );

    // Step 23: Copy public assets to dist root (server expects them there)
    await copyPublicAssets(projectRoot, distDir);

    const duration = performance.now() - startTime;

    buildLogger.info(`📊 Build Summary:`);
    buildLogger.info(`   Client components: ${clientComponents.length}`);
    buildLogger.info(`   Build time: ${duration.toFixed(0)}ms`);

    return {
      success: true,
      clientBundle,
      moduleMap,
      clientComponents: clientComponents.length,
      duration,
      timestamp: buildTimestamp,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : null;
    buildLogger.error("❌ Build failed:");
    buildLogger.error(`  Error: ${errorMessage}`);
    if (errorStack !== null) {
      buildLogger.error(`  Stack trace:\n${errorStack}`);
    }
    return {
      success: false,
      clientBundle: "",
      moduleMap: {},
      clientComponents: 0,
      duration: performance.now() - startTime,
      timestamp: Date.now(),
    };
  }
}

/**
 * Ensure build is ready - builds if needed, skips if up-to-date
 * @param context - Build context with configuration and paths
 * @returns Build result
 */
export async function ensureBuildIsReady(
  context: BuildContext,
): Promise<BuildResult> {
  if (await needsRebuild(context)) {
    buildLogger.info("🔄 Build needed, running build...");
    return await build(context);
  } else {
    buildLogger.info("✅ Build is up-to-date, skipping...");
    return await loadExistingBuild(context);
  }
}

/**
 * Check if rebuild is needed based on file timestamps
 * @param context - Build context
 * @returns True if rebuild is needed
 */
async function needsRebuild(context: BuildContext): Promise<boolean> {
  const { distDir, chunkManifestFile, srcDir, clientEntry, projectRoot } =
    context;

  // Check if dist directory exists
  if (!(await runtime.fs.exists(distDir))) {
    return true;
  }

  // Check if chunk manifest file exists
  if (!(await runtime.fs.exists(chunkManifestFile))) {
    return true;
  }

  // Get build timestamp from chunk manifest
  const manifestContent = await runtime.fs.readTextFile(chunkManifestFile);
  const manifest: ChunkManifest = JSON.parse(manifestContent);
  const buildTimestamp = manifest.timestamp;

  // Check if any source file is newer than build
  const sourceFiles = [];
  for await (const entry of runtime.fs.readDir(srcDir)) {
    if (entry.isFile && JS_FILE_PATTERN.test(entry.name)) {
      sourceFiles.push(runtime.path.resolve(srcDir, entry.name));
    }
  }

  // Check client entry
  sourceFiles.push(clientEntry);

  for (const file of sourceFiles) {
    try {
      const fileStat = await runtime.fs.stat(file);
      if (fileStat.mtime && fileStat.mtime.getTime() > buildTimestamp) {
        buildLogger.debug(
          `  Changed: ${runtime.path.relative(projectRoot, file)}`,
        );
        return true;
      }
    } catch {
      // File might not exist, skip
    }
  }

  return false;
}

/**
 * Load existing build result
 */
/**
 * Load existing build result from manifest files
 * @param context - Build context
 * @returns Build result from previous successful build
 */
async function loadExistingBuild(context: BuildContext): Promise<BuildResult> {
  const { chunkManifestFile, distDir } = context;

  const manifestContent = await runtime.fs.readTextFile(chunkManifestFile);
  const manifest: ChunkManifest = JSON.parse(manifestContent);
  const moduleMapContent = await runtime.fs.readTextFile(
    runtime.path.resolve(distDir, MODULE_MAP_FILENAME),
  );
  const moduleMap: ModuleMap = JSON.parse(moduleMapContent);

  return {
    success: true,
    clientBundle: runtime.path.resolve(distDir, "client.js"),
    moduleMap,
    clientComponents: Object.keys(moduleMap).length,
    duration: 0,
    timestamp: manifest.timestamp,
  };
}

/**
 * Watch mode for Hot Module Replacement (HMR)
 * Monitors source files and rebuilds on changes
 * @param context - Build context
 * @param onChange - Callback invoked when rebuild completes
 * @returns File system watcher
 */
export function watch(
  context: BuildContext,
  onChange: (result: BuildResult) => void,
): FsWatcher {
  const { srcDir, distDir, projectRoot } = context;
  buildLogger.debug(
    "👁️  Watch mode enabled, monitoring for changes...",
  );

  // Get or create the global build cache for incremental builds
  const cache = getGlobalBuildCache();
  const contextWithCache = { ...context, cache };

  // Compute relative dist directory path for filtering
  const relativeDistDir = runtime.path.relative(projectRoot, distDir);

  // Build list of paths to watch
  const watchPaths: string[] = [srcDir];

  const watcher = runtime.fs.watch(watchPaths);

  let building = false;
  let pendingRebuild = false;
  const changedFiles: Set<string> = new Set();

  // Debounce timer to batch rapid file changes
  let debounceTimer: number | null = null;
  const DEBOUNCE_MS = 50;

  /**
   * Trigger a build with proper handling of pending rebuilds
   * Uses do-while loop to ensure pending rebuilds are processed immediately
   */
  async function triggerBuild() {
    if (building) {
      pendingRebuild = true;
      return;
    }

    building = true;

    // Keep rebuilding while there are pending changes
    do {
      pendingRebuild = false;

      try {
        // Check what types of files changed
        const changedFilesList = Array.from(changedFiles);

        // Invalidate cache entries for changed files
        cache.invalidateFiles(
          changedFilesList.map((f) => runtime.path.resolve(projectRoot, f)),
        );

        const hasCssChanges = changedFilesList.some((file) =>
          file.endsWith(".css")
        );
        const hasJsChanges = changedFilesList.some((file) =>
          file.match(/\.(tsx?|jsx?)$/)
        );

        // Determine build mode:
        // - cssOnly: only CSS changed, use fast path (no JS rebuild)
        // - skipCss: only JS changed, skip CSS processing
        // - full build: both changed
        const cssOnly = hasCssChanges && !hasJsChanges;
        const skipCss = !hasCssChanges && hasJsChanges;

        // Convert changed files to absolute paths for incremental virtual source
        const changedFilesAbsolute = new Set(
          changedFilesList.map((f) => runtime.path.resolve(projectRoot, f)),
        );

        const result = await build(contextWithCache, {
          skipCss,
          cssOnly,
          changedFiles: changedFilesAbsolute,
        });

        // Attach changed files to the build result
        result.changedFiles = Array.from(changedFiles);

        buildLogger.debug(
          `✅ Rebuild complete (${result.duration.toFixed(0)}ms)`,
        );
        onChange(result);

        // Clear changed files after successful build
        changedFiles.clear();
      } catch (error) {
        buildLogger.error("❌ Rebuild failed:", { error });
        // Keep changed files on error so they can be retried
      }
    } while (pendingRebuild);

    building = false;
  }

  (async () => {
    for await (const event of watcher) {
      if (
        event.kind === "modify" || event.kind === "create" ||
        event.kind === "remove"
      ) {
        const eventPath = event.paths[0];
        if (!eventPath) continue;
        const changedFile = runtime.path.relative(projectRoot, eventPath);

        // Skip non-source files (tsx/jsx/css)
        if (!changedFile.match(/\.(tsx?|jsx?|css)$/)) continue;

        // Skip dist directory (build outputs shouldn't trigger rebuilds)
        // Convert to POSIX format for cross-platform path comparison
        const normalizedChangedFile = toPosix(changedFile);
        const normalizedDistDir = toPosix(relativeDistDir);
        if (normalizedChangedFile.startsWith(`${normalizedDistDir}/`)) {
          continue;
        }

        // Skip temporary files (e.g., .temp.css from CSS module processing)
        if (changedFile.includes(".temp.")) continue;

        buildLogger.debug(`🔄 File changed: ${changedFile}`);

        // Collect changed files for this rebuild
        changedFiles.add(changedFile);

        // Debounce: clear existing timer and set a new one
        // This batches rapid file changes (e.g., editor save operations)
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          triggerBuild();
        }, DEBOUNCE_MS) as unknown as number;
      }
    }
  })();

  return watcher;
}

/**
 * Bundle client code using Deno's native bundler with code splitting
 * @param context - Build context
 * @param clientComponents - Array of client components to bundle
 * @param buildId - Unique build identifier
 * @param timestamp - Build timestamp
 * @returns Path to the generated entry point
 */
async function bundleClient(
  context: BuildContext,
  clientComponents: ClientComponent[],
  buildId: string,
  timestamp: number,
): Promise<string> {
  const { config, projectRoot, distDir } = context;

  // Generate entry file that includes all client components + bootstrap
  const { plugin } = context;
  if (!plugin.createClientEntry) {
    throw new Error("Framework plugin must implement createClientEntry");
  }
  const generatedEntry = await plugin.createClientEntry(
    clientComponents,
    projectRoot,
    distDir,
  );

  try {
    // Use Deno bundle with code splitting and --packages bundle
    // Pass ALL component files as entrypoints for proper code splitting
    // Deno will create separate chunks for each and extract shared deps (React) into common chunks
    const componentEntrypoints = clientComponents.map((c) => c.filePath);
    const clientOutputDir = runtime.path.resolve(distDir, CLIENT_DIR);

    // Create import map resolver plugin to handle all bare imports
    // Uses both deno.json and package.json for import resolution
    // autoMarkExternal: false ensures npm packages are bundled inline for browsers
    // (browsers can't resolve bare specifiers without an import map)
    const importMapPlugin = createImportMapResolverPlugin({
      projectRoot,
      browserShims: config.browserShims,
      autoMarkExternal: false,
    });

    const define: Record<string, string> = {
      ...PRODUCTION_SETTINGS.define,
    };

    if (!context.bundlerBackend) {
      throw new Error("Bundler backend is required for client bundling");
    }

    const bundleResult = await bundle(
      {
        entrypoints: [generatedEntry, ...componentEntrypoints],
        outputDir: clientOutputDir,
        projectRoot,
        minify: PRODUCTION_SETTINGS.minify,
        splitting: PRODUCTION_SETTINGS.codeSplitting,
        platform: "browser",
        sourcemap: PRODUCTION_SETTINGS.sourceMaps,
        plugins: [importMapPlugin],
        define,
      },
      clientComponents,
      context.bundlerBackend,
    );

    // Generate chunk manifest (HMR disabled for non-runtime builds)
    const chunkManifest = generateChunkManifest(
      buildId,
      timestamp,
      bundleResult,
      clientComponents,
      config.logLevel,
      false, // hmrEnabled - false for prebuilt bundler
    );

    // Save chunk manifest to client directory
    const manifestPath = runtime.path.resolve(
      clientOutputDir,
      MANIFEST_FILENAME,
    );
    await saveChunkManifest(chunkManifest, manifestPath);

    // Clean up generated entry file
    try {
      await runtime.fs.remove(generatedEntry);
    } catch {
      // Ignore if file doesn't exist
    }

    logBundleStats(bundleResult);
    logManifest(chunkManifest);

    // Return path to entrypoint
    return runtime.path.resolve(distDir, bundleResult.entrypoint);
  } catch (error) {
    // Clean up on error
    try {
      await runtime.fs.remove(generatedEntry);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Adjust relative paths in a record of string values
 * Prepends relativePath to values that start with "./" or "../"
 */
function adjustRelativePaths(
  record: Record<string, string>,
  relativePath: string,
): void {
  for (const [key, value] of Object.entries(record)) {
    if (
      typeof value === "string" &&
      (value.startsWith("./") || value.startsWith("../"))
    ) {
      record[key] = runtime.path.join(relativePath, value);
    }
  }
}

/**
 * Copy config files to output directory using @eser/codebase/package
 * Handles deno.json, deno.jsonc, and package.json
 * - deno.json/deno.jsonc: adjusts relative paths in "imports"
 * - package.json: copies as-is (dependencies use npm: specifiers)
 * @param projectRoot - Project root directory
 * @param outputDir - Output directory (e.g., dist/server)
 */
async function copyConfigFilesWithImportMaps(
  projectRoot: string,
  outputDir: string,
): Promise<void> {
  // Load all config files using @eser/codebase/package
  const config = await pkg.tryLoad({ baseDir: projectRoot });

  if (config === undefined) {
    buildLogger.debug("No config files found to copy");
    return;
  }

  // Compute relative path from outputDir back to projectRoot
  const relativePath = runtime.path.relative(outputDir, projectRoot);
  let copiedCount = 0;

  // Process each loaded config file
  for (const file of config._loadedFiles) {
    try {
      // Clone the content to avoid mutating the original
      const content = JSON.parse(JSON.stringify(file.content)) as Record<
        string,
        unknown
      >;

      // Adjust relative paths in "imports" field (deno.json/deno.jsonc)
      if (
        content["imports"] !== undefined &&
        typeof content["imports"] === "object" &&
        content["imports"] !== null
      ) {
        adjustRelativePaths(
          content["imports"] as Record<string, string>,
          relativePath,
        );
      }

      // Write to output directory
      const destPath = runtime.path.join(outputDir, file.fileType);
      await runtime.fs.writeTextFile(
        destPath,
        JSON.stringify(content, null, 2),
      );
      copiedCount++;
    } catch (error) {
      buildLogger.debug(
        `Failed to copy ${file.fileType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (copiedCount > 0) {
    const fileList = copiedCount === 1 ? "config file" : "config files";
    buildLogger.info(
      `   📋 Copied ${copiedCount} ${fileList} to dist/server for import resolution`,
    );
  }
}

/**
 * Copy public assets to dist
 * @param projectRoot - Project root directory
 * @param distDir - Destination directory
 */
async function copyPublicAssets(
  projectRoot: string,
  distDir: string,
): Promise<void> {
  const publicDir = runtime.path.resolve(projectRoot, "public");

  if (!(await runtime.fs.exists(publicDir))) {
    return;
  }

  // Copy all files and directories recursively
  for await (const entry of runtime.fs.readDir(publicDir)) {
    const sourcePath = runtime.path.resolve(publicDir, entry.name);
    const destPath = runtime.path.resolve(distDir, entry.name);
    await copy(sourcePath, destPath, { overwrite: true });
  }
}

/**
 * Copy translation JSON files to server directory
 * Copies {srcDir}/app/messages/*.json to dist/server/{srcDirName}/app/messages/
 * Also copies {srcDir}/lib/i18n/messages/*.json to dist/server/{srcDirName}/lib/i18n/messages/
 * @param srcDir - Source directory (absolute path)
 * @param serverDistDir - Server distribution directory (dist/server)
 * @param projectRoot - Project root directory for computing srcDirName
 */
async function copyTranslationFiles(
  srcDir: string,
  serverDistDir: string,
  projectRoot: string,
): Promise<void> {
  let totalCopied = 0;
  // Get srcDir name relative to project root (e.g., "src")
  const srcDirName = runtime.path.relative(projectRoot, srcDir);

  // Copy from {srcDir}/app/messages/ (legacy location)
  const appMessagesSourceDir = runtime.path.resolve(
    srcDir,
    "app/messages",
  );
  const appMessagesDestDir = runtime.path.resolve(
    serverDistDir,
    srcDirName,
    "app/messages",
  );

  if (await runtime.fs.exists(appMessagesSourceDir)) {
    await runtime.fs.ensureDir(appMessagesDestDir);
    for await (const entry of runtime.fs.readDir(appMessagesSourceDir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const sourcePath = runtime.path.resolve(
          appMessagesSourceDir,
          entry.name,
        );
        const destPath = runtime.path.resolve(appMessagesDestDir, entry.name);
        await copy(sourcePath, destPath, { overwrite: true });
        totalCopied++;
      }
    }
  }

  // Copy from {srcDir}/lib/i18n/messages/ (loader.ts location)
  const i18nMessagesSourceDir = runtime.path.resolve(
    srcDir,
    "lib/i18n/messages",
  );
  const i18nMessagesDestDir = runtime.path.resolve(
    serverDistDir,
    srcDirName,
    "lib/i18n/messages",
  );

  if (await runtime.fs.exists(i18nMessagesSourceDir)) {
    await runtime.fs.ensureDir(i18nMessagesDestDir);
    for await (const entry of runtime.fs.readDir(i18nMessagesSourceDir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const sourcePath = runtime.path.resolve(
          i18nMessagesSourceDir,
          entry.name,
        );
        const destPath = runtime.path.resolve(i18nMessagesDestDir, entry.name);
        await copy(sourcePath, destPath, { overwrite: true });
        totalCopied++;
      }
    }
  }

  if (totalCopied > 0) {
    buildLogger.debug(`✓ Copied ${totalCopied} translation file(s)`);
  } else {
    buildLogger.debug(
      "No messages directories found, skipping translation files",
    );
  }
}

/**
 * Process CSS files using @eser/bundler's Tailwind processing
 * @param plugin - CSS plugin to use for processing
 * @param srcDir - Source directory (absolute path)
 * @param projectRoot - Project root directory
 * @param distDir - Distribution directory
 */
async function processCssFiles(
  plugin: CssPlugin,
  srcDir: string,
  projectRoot: string,
  distDir: string,
): Promise<void> {
  // CSS input path relative to srcDir
  const cssInput = runtime.path.resolve(
    srcDir,
    "app/styles/global.css",
  );
  const cssOutput = runtime.path.resolve(distDir, "styles.css");

  // Check if CSS source file exists
  if (!(await runtime.fs.exists(cssInput))) {
    buildLogger.debug("No CSS source file found, skipping CSS processing");
    return;
  }

  try {
    await processCss({
      input: cssInput,
      output: cssOutput,
      minify: true,
      projectRoot,
      plugin,
    });
    buildLogger.debug("✓ CSS processed");
  } catch (error) {
    buildLogger.error("CSS processing failed:", { error });
    throw error;
  }
}

/**
 * Extract critical CSS from processed styles
 * Splits CSS into critical (inlined) and deferred (async loaded)
 *
 * Uses the CSS plugin's extractCriticalCss method if available.
 * The extraction is framework-aware (e.g., Tailwind v4 layer handling).
 *
 * @param plugin - CSS plugin to use for extraction
 * @param distDir - Distribution directory containing styles.css
 */
async function extractCriticalPageCssFiles(
  plugin: CssPlugin,
  distDir: string,
): Promise<{ criticalPath: string; deferredPath: string } | null> {
  // Check if plugin supports critical CSS extraction
  if (!plugin.extractCriticalCss) {
    buildLogger.debug(
      "CSS plugin doesn't support critical CSS extraction, skipping",
    );
    return null;
  }

  const stylesPath = runtime.path.resolve(distDir, "styles.css");

  // Check if styles.css exists
  if (!(await runtime.fs.exists(stylesPath))) {
    buildLogger.debug("No styles.css found, skipping critical CSS extraction");
    return null;
  }

  try {
    const fullCss = await runtime.fs.readTextFile(stylesPath);

    // Representative HTML template covering common layout patterns
    // This ensures all layout-critical utilities are included
    const representativeHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head></head>
      <body>
        <div id="root" class="flex flex-col lg:flex-row min-h-screen bg-neutral-50">
          <aside class="w-full lg:w-64 bg-surface border-b lg:border-b-0 lg:border-r border-neutral-200 flex-shrink-0">
            <div class="lg:sticky lg:top-0 p-4 lg:p-6">
              <nav class="space-y-4">
                <a href="#" class="flex items-center gap-2 text-neutral-600 hover:text-primary-600">Link</a>
              </nav>
            </div>
          </aside>
          <div class="flex-1 flex flex-col">
            <main class="flex-1">
              <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-20">
                <h1 class="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900 mb-4">Title</h1>
                <h2 class="text-lg font-bold text-neutral-900 mb-2">Subtitle</h2>
                <p class="text-neutral-600 text-lg mb-6">Description</p>
                <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div class="bg-surface rounded-lg border border-neutral-200 p-4 shadow-sm">Card</div>
                </div>
                <div class="flex flex-wrap gap-4 items-center justify-center">
                  <button class="btn" data-variant="primary">Primary</button>
                  <button class="btn" data-variant="secondary">Secondary</button>
                </div>
              </div>
            </main>
            <footer class="flex flex-wrap items-center justify-center gap-6 p-8 text-sm border-t border-neutral-200 bg-surface min-h-[5.5rem]">
              <a href="#" class="flex items-center gap-2 text-neutral-600 hover:text-primary-600">Footer Link</a>
            </footer>
          </div>
        </div>
      </body>
      </html>
    `;

    // Use plugin's extractCriticalCss method with comprehensive force-include patterns
    const result = plugin.extractCriticalCss(fullCss, representativeHtml, {
      forceInclude: [
        // Layout utilities - MUST be in critical CSS
        /^\.flex/,
        /^\.grid/,
        /^\.block/,
        /^\.inline/,
        /^\.items-/,
        /^\.justify-/,
        /^\.gap-/,
        /^\.space-/,
        /^\.min-h-/,
        /^\.max-w-/,
        /^\.w-/,
        /^\.h-/,
        /^\.mx-/,
        /^\.my-/,
        /^\.px-/,
        /^\.py-/,
        /^\.p-/,
        /^\.m-/,
        /^\.mt-/,
        /^\.mb-/,
        /^\.ml-/,
        /^\.mr-/,
        /^\.pt-/,
        /^\.pb-/,
        /^\.pl-/,
        /^\.pr-/,
        // Responsive variants
        /^\.sm:/,
        /^\.md:/,
        /^\.lg:/,
        /^\.xl:/,
        /^\.2xl:/,
        // Background and text colors for initial render
        /^\.bg-neutral-/,
        /^\.bg-surface/,
        /^\.bg-primary-/,
        /^\.text-neutral-/,
        /^\.text-primary-/,
        /^\.text-white/,
        // Border utilities
        /^\.border/,
        /^\.rounded/,
        // Typography
        /^\.text-sm/,
        /^\.text-lg/,
        /^\.text-xl/,
        /^\.text-2xl/,
        /^\.text-3xl/,
        /^\.text-4xl/,
        /^\.text-5xl/,
        /^\.font-/,
        /^\.leading-/,
        // Visibility and overflow
        /^\.overflow-/,
        /^\.visible/,
        /^\.invisible/,
        /^\.hidden/,
        // Position
        /^\.relative/,
        /^\.absolute/,
        /^\.fixed/,
        /^\.sticky/,
        // Shadows
        /^\.shadow/,
        // Base selectors
        /^html/,
        /^body/,
        /^#root/,
        /^\*/,
      ],
    });

    // Save critical and deferred CSS
    const criticalPath = runtime.path.resolve(distDir, "styles.critical.css");
    const deferredPath = runtime.path.resolve(distDir, "styles.deferred.css");

    await runtime.fs.writeTextFile(criticalPath, result.critical);
    await runtime.fs.writeTextFile(deferredPath, result.deferred);

    const stats = result.stats;
    if (stats) {
      buildLogger.debug(
        `✓ Critical CSS extracted: ${stats.criticalSize} bytes critical, ${stats.deferredSize} bytes deferred`,
      );
    } else {
      buildLogger.debug("✓ Critical CSS extracted");
    }

    return { criticalPath, deferredPath };
  } catch (error) {
    buildLogger.error("Critical CSS extraction failed:", { error });
    // Non-fatal - fall back to full CSS loading
    return null;
  }
}

/**
 * Generate universal CSS (base/theme styles) from compiled CSS output
 * This CSS contains reset styles and theme variables.
 *
 * Uses the CSS plugin's extractUniversalCss method if available.
 *
 * @param plugin - CSS plugin to use for extraction
 * @param distDir - Distribution directory containing styles.css
 * @returns Path to the generated universal CSS file, or null if generation failed
 */
async function generateCriticalUniversalCssFile(
  plugin: CssPlugin,
  distDir: string,
): Promise<string | null> {
  // Check if plugin supports universal CSS extraction
  if (!plugin.extractUniversalCss) {
    buildLogger.debug(
      "CSS plugin doesn't support universal CSS extraction, skipping",
    );
    return null;
  }

  const stylesPath = runtime.path.resolve(distDir, "styles.css");

  // Check if styles.css exists
  if (!(await runtime.fs.exists(stylesPath))) {
    buildLogger.debug("No styles.css found, skipping universal CSS generation");
    return null;
  }

  try {
    const compiledCss = await runtime.fs.readTextFile(stylesPath);

    // Use plugin's extractUniversalCss method
    const result = plugin.extractUniversalCss(compiledCss);

    // Save universal CSS
    const universalPath = runtime.path.resolve(distDir, "styles.universal.css");
    await runtime.fs.writeTextFile(universalPath, result.css);

    buildLogger.debug(
      `✓ Universal CSS generated: ${result.css.length} bytes`,
    );

    return universalPath;
  } catch (error) {
    buildLogger.error("Universal CSS generation failed:", { error });
    // Non-fatal - will use default fallback
    return null;
  }
}

/**
 * Clean build directory
 * @param distDir - Distribution directory to clean
 */
async function cleanBuildDir(
  distDir: string,
  preserveCss?: boolean,
): Promise<void> {
  if (!await runtime.fs.exists(distDir)) {
    return;
  }

  if (preserveCss) {
    // Selective cleanup: preserve CSS files in client directory
    buildLogger.debug("🧹 Cleaning build directory (preserving CSS)");

    // Remove server directory completely
    const serverDir = runtime.path.resolve(distDir, SERVER_DIR);
    if (await runtime.fs.exists(serverDir)) {
      await runtime.fs.remove(serverDir, { recursive: true });
    }

    // Clean client directory but preserve CSS files
    const clientDir = runtime.path.resolve(distDir, CLIENT_DIR);
    if (await runtime.fs.exists(clientDir)) {
      for await (const entry of runtime.fs.readDir(clientDir)) {
        // Preserve CSS files and font directories
        if (
          entry.name.endsWith(".css") ||
          entry.name === "fonts" ||
          entry.name === "fonts.css" ||
          entry.name === "font-preloads.json"
        ) {
          continue;
        }

        const entryPath = runtime.path.resolve(clientDir, entry.name);
        await runtime.fs.remove(entryPath, { recursive: true });
      }
    }
  } else {
    // Full cleanup
    await runtime.fs.remove(distDir, { recursive: true });
    buildLogger.debug("🧹 Cleaned build directory");
  }
}

/**
 * Optimize Google Fonts for self-hosting
 * Downloads font files and generates preload hints
 * @param distDir - Distribution directory
 * @param fonts - Font configuration
 */
async function optimizeFonts(
  distDir: string,
  fonts: FontDefinition[],
): Promise<void> {
  const fontUrls = getFontUrls(fonts);

  const firstFontUrl = fontUrls[0];
  if (!firstFontUrl) {
    buildLogger.debug("✓ No fonts configured, skipping font optimization");
    return;
  }

  const fontsDir = runtime.path.resolve(distDir, "fonts");
  const publicPath = "/fonts";

  try {
    const result = await optimizeGoogleFonts(
      firstFontUrl,
      fontsDir,
      publicPath,
    );

    // Save font CSS to a file that can be inlined in HTML
    const fontCssPath = runtime.path.resolve(distDir, "fonts.css");
    await runtime.fs.writeTextFile(fontCssPath, result.fontFaceCSS);

    // Save preload hints to a file for HTML shell integration
    const preloadHintsPath = runtime.path.resolve(
      distDir,
      "font-preloads.json",
    );
    await runtime.fs.writeTextFile(
      preloadHintsPath,
      JSON.stringify(result.preloadHints, null, 2),
    );

    buildLogger.debug(
      `✓ Fonts optimized: ${result.files.length} file(s), ${
        (result.totalSize / 1024).toFixed(2)
      } KB`,
    );
  } catch (error) {
    buildLogger.error("Font optimization failed:", { error });
    // Don't throw - font optimization is optional
    buildLogger.warn("Continuing build without font optimization");
  }
}

/**
 * Copy CSS Module JSON files from client/ to server/ directory
 * Server components need these JSON files to import CSS module class mappings
 * @param cssModulePaths - Array of source CSS module paths
 * @param clientOutputDir - Client output directory where JSON files are
 * @param serverOutputDir - Server output directory to copy JSON files to
 * @param projectRoot - Project root directory
 */
async function _copyCssModuleJsonFiles(
  cssModulePaths: string[],
  clientOutputDir: string,
  serverOutputDir: string,
  projectRoot: string,
): Promise<void> {
  for (const cssPath of cssModulePaths) {
    // Get relative path from project root
    const relativePath = runtime.path.relative(projectRoot, cssPath);

    // Construct JSON file paths
    const jsonFilename = runtime.path.basename(cssPath) + ".json";
    const sourceJsonPath = runtime.path.join(
      clientOutputDir,
      runtime.path.dirname(relativePath),
      jsonFilename,
    );
    const targetJsonPath = runtime.path.join(
      serverOutputDir,
      runtime.path.dirname(relativePath),
      jsonFilename,
    );

    // Ensure target directory exists
    await runtime.fs.ensureDir(runtime.path.dirname(targetJsonPath));

    // Copy JSON file
    try {
      await copy(sourceJsonPath, targetJsonPath, { overwrite: true });
      buildLogger.debug(
        `   ✓ Copied ${runtime.path.relative(projectRoot, cssPath)}.json`,
      );
    } catch (error) {
      buildLogger.warn(
        `   ⚠ Failed to copy JSON for ${
          runtime.path.relative(projectRoot, cssPath)
        }:`,
        { error },
      );
    }
  }
}

/**
 * Copy CSS Module JSON files from client/ to src/ directory
 * Client components (bundled from src/) need these JSON files to be available in src/
 * @param cssModulePaths - Array of source CSS module paths
 * @param clientOutputDir - Client output directory where JSON files are
 * @param projectRoot - Project root directory
 */
async function _copyCssModuleJsonFilesToSrc(
  cssModulePaths: string[],
  clientOutputDir: string,
  projectRoot: string,
): Promise<void> {
  let copiedCount = 0;

  for (const cssPath of cssModulePaths) {
    // Get relative path from project root
    const relativePath = runtime.path.relative(projectRoot, cssPath);

    // Construct JSON file paths
    const jsonFilename = runtime.path.basename(cssPath) + ".json";
    const sourceJsonPath = runtime.path.join(
      clientOutputDir,
      runtime.path.dirname(relativePath),
      jsonFilename,
    );
    const targetJsonPath = runtime.path.join(
      projectRoot,
      runtime.path.dirname(relativePath),
      jsonFilename,
    );

    // Ensure target directory exists
    await runtime.fs.ensureDir(runtime.path.dirname(targetJsonPath));

    // Copy JSON file
    try {
      await copy(sourceJsonPath, targetJsonPath, { overwrite: true });
      buildLogger.debug(
        `   ✓ Copied ${
          runtime.path.relative(projectRoot, cssPath)
        }.json to src/`,
      );
      copiedCount++;
    } catch (error) {
      buildLogger.warn(
        `   ⚠ Failed to copy JSON for ${
          runtime.path.relative(projectRoot, cssPath)
        } to src/:`,
        { error },
      );
    }
  }

  if (copiedCount > 0) {
    buildLogger.debug(
      `✓ Copied ${copiedCount} CSS module JSON file(s) to src/`,
    );
  }
}

/**
 * Scan for all CSS module files in a directory
 * @param srcDir - Source directory to scan
 * @returns Array of absolute paths to .module.css files
 */
async function scanCssModuleFiles(srcDir: string): Promise<string[]> {
  const cssModuleFiles: string[] = [];

  async function scanDirectory(dir: string): Promise<void> {
    for await (const entry of runtime.fs.readDir(dir)) {
      const fullPath = runtime.path.resolve(dir, entry.name);

      if (entry.isDirectory) {
        await scanDirectory(fullPath);
      } else if (entry.isFile && entry.name.endsWith(".module.css")) {
        cssModuleFiles.push(fullPath);
      }
    }
  }

  await scanDirectory(srcDir);
  return cssModuleFiles;
}

/**
 * Process CSS Modules files
 * Finds and processes all .module.css files with Lightning CSS
 * @param projectRoot - Project root directory
 * @param distDir - Distribution directory
 * @param config - Build configuration
 * @param options - Processing options including plugin
 */
async function processCssModulesFiles(
  projectRoot: string,
  distDir: string,
  config: BuildConfig,
  options?: {
    skipCss?: boolean;
    cssModulePaths?: string[];
    cache?: BuildCache;
  },
): Promise<Map<string, CSSModuleResult>> {
  // Use pre-scanned paths if provided, otherwise scan using config.srcDir
  const cssModuleFiles = options?.cssModulePaths ??
    await scanCssModuleFiles(config.srcDir);

  if (cssModuleFiles.length === 0) {
    buildLogger.debug("No CSS modules found, skipping CSS module processing");
    return new Map();
  }

  buildLogger.debug(`Found ${cssModuleFiles.length} CSS module(s)`);

  try {
    // Process all CSS modules
    const results = await processCSSModules(cssModuleFiles, {
      generateDTS: config.cssModuleTypes,
      projectRoot,
      cache: options?.cache,
    });

    // Save outputs to output directory (JSON files for bundler resolution)
    // When skipCss is true, only save JSON files (not processed CSS)
    for (const [cssPath, result] of results) {
      await saveCSSModuleOutputs(cssPath, result, distDir, {
        skipCss: options?.skipCss,
        projectRoot, // Pass projectRoot for correct relative path calculation
      });
    }

    buildLogger.debug(
      `✓ Processed ${cssModuleFiles.length} CSS module(s)${
        config.cssModuleTypes ? " with TypeScript definitions" : ""
      }`,
    );

    return results;
  } catch (error) {
    buildLogger.error("CSS module processing failed:", { error });
    throw error;
  }
}

/**
 * Copy CSS Module JSON files from src/ to a target directory
 * @param cssModulePaths - Array of source CSS module paths
 * @param projectRoot - Project root directory
 * @param targetDir - Target directory to copy JSON files to
 */
async function copyCssModuleJsonFilesFromSrc(
  cssModulePaths: string[],
  projectRoot: string,
  targetDir: string,
): Promise<void> {
  let copiedCount = 0;

  for (const cssPath of cssModulePaths) {
    // Get relative path from project root
    const relativePath = runtime.path.relative(projectRoot, cssPath);

    // Construct JSON file paths
    const jsonFilename = runtime.path.basename(cssPath) + ".json";
    const sourceJsonPath = runtime.path.join(
      projectRoot,
      runtime.path.dirname(relativePath),
      jsonFilename,
    );
    const targetJsonPath = runtime.path.join(
      targetDir,
      runtime.path.dirname(relativePath),
      jsonFilename,
    );

    // Ensure target directory exists
    await runtime.fs.ensureDir(runtime.path.dirname(targetJsonPath));

    // Copy JSON file
    try {
      await copy(sourceJsonPath, targetJsonPath, { overwrite: true });
      copiedCount++;
    } catch (error) {
      buildLogger.warn(
        `   ⚠ Failed to copy JSON for ${
          runtime.path.relative(projectRoot, cssPath)
        }:`,
        { error },
      );
    }
  }

  if (copiedCount > 0) {
    buildLogger.debug(
      `✓ Copied ${copiedCount} CSS module JSON file(s)`,
    );
  }
}

/**
 * Append CSS module styles to the main styles.css bundle
 * @param cssModulePaths - Array of pre-scanned CSS module paths
 * @param projectRoot - Project root directory
 * @param clientOutputDir - Client output directory containing styles.css
 * @param preProcessedResults - Optional pre-processed CSS module results to avoid re-processing
 */
async function appendCssModulesToStyles(
  cssModulePaths: string[],
  projectRoot: string,
  clientOutputDir: string,
  preProcessedResults?: Map<string, { code: string }>,
): Promise<void> {
  // Use pre-scanned paths directly (no redundant scan)
  if (cssModulePaths.length === 0) {
    return;
  }

  let results: Map<string, { code: string }>;

  if (preProcessedResults) {
    // Use pre-processed results if available
    results = preProcessedResults;
  } else {
    // Process CSS modules only if not already processed
    results = await processCSSModules(cssModulePaths, {
      generateDTS: false,
      projectRoot,
    });
  }

  // Collect processed CSS content
  const cssModuleContents: string[] = [];
  for (const [, result] of results) {
    cssModuleContents.push(result.code);
  }

  // Append CSS module styles to main styles.css bundle
  if (cssModuleContents.length > 0) {
    const stylesPath = runtime.path.resolve(clientOutputDir, "styles.css");
    let existingStyles = "";
    try {
      existingStyles = await runtime.fs.readTextFile(stylesPath);
    } catch {
      // styles.css doesn't exist yet, that's fine
    }
    // Strip ANSI color codes from both existing styles and CSS module contents
    // deno-lint-ignore no-control-regex
    existingStyles = existingStyles.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
    const cleanedContents = cssModuleContents.map((content) =>
      // deno-lint-ignore no-control-regex
      content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
    );
    const combinedStyles = existingStyles + "\n" +
      cleanedContents.join("\n");
    await runtime.fs.writeTextFile(stylesPath, combinedStyles);
    buildLogger.debug(
      `✓ Appended ${cssModuleContents.length} CSS module(s) to styles.css`,
    );
  }
}

/**
 * Optimize images for production
 * Converts to WebP/AVIF, generates responsive variants, creates blur placeholders
 * @param projectRoot - Project root directory
 * @param distDir - Distribution directory
 * @param config - Build configuration
 */
async function optimizeImagesStep(
  projectRoot: string,
  distDir: string,
  config: BuildConfig,
): Promise<void> {
  const { optimizeImages, scanImages } = await import(
    "./adapters/sharp/mod.ts"
  );

  // Look for images in public/ directory
  const publicDir = runtime.path.resolve(projectRoot, "public");
  const imagesInputDir = runtime.path.resolve(publicDir, "images");

  // Check if images directory exists
  if (!(await runtime.fs.exists(imagesInputDir))) {
    buildLogger.debug(
      "✓ No images directory found, skipping image optimization",
    );
    return;
  }

  // Scan for images
  const imagePaths = await scanImages(imagesInputDir);
  if (imagePaths.length === 0) {
    buildLogger.debug("✓ No images found, skipping image optimization");
    return;
  }

  try {
    const imagesOutputDir = runtime.path.resolve(distDir, "images");
    const manifest = await optimizeImages(
      imagesInputDir,
      imagesOutputDir,
      "/images",
      {
        formats: config.images.formats,
        widths: config.images.widths,
        quality: config.images.quality,
        generateBlurPlaceholder: config.images.placeholder === "blur",
      },
    );

    const imageCount = Object.keys(manifest.images).length;
    if (imageCount > 0) {
      buildLogger.debug(`✓ Optimized ${imageCount} image(s)`);
    }
  } catch (error) {
    buildLogger.error("Image optimization failed:", { error });
    // Don't throw - image optimization is optional
    buildLogger.warn("Continuing build without image optimization");
  }
}
