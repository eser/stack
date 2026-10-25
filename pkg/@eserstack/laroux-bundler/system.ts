// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Unified Build System
 *
 * Framework-agnostic build orchestration.
 * Framework-specific functionality (like React Server Components) is provided
 * through the FrameworkPlugin interface.
 */

import * as crossRuntime from "@eserstack/standards/cross-runtime";
import type { FsWatcher } from "@eserstack/standards/cross-runtime";
import * as logging from "@eserstack/logging";
import * as directiveAnalysis from "@eserstack/codebase/directive-analysis";
import * as patterns from "@eserstack/standards/patterns";
import * as serverActionTransform from "./domain/server-action-transform.ts";
import * as clientActionStub from "./domain/client-action-stub.ts";
import * as buildValidator from "./domain/build-validator.ts";
import * as fs from "@std/fs"; // copy not available in runtime
import * as ulid from "@std/ulid";
import type {
  ClientComponent,
  FrameworkPlugin,
  ModuleMap,
} from "./domain/framework-plugin.ts";
import * as frameworkPlugin from "./domain/framework-plugin.ts";
import type { BundlerBackend } from "./config.ts";
import * as types from "./types.ts";
import type { ChunkManifest } from "./domain/chunk-manifest.ts";
import type { CssPlugin } from "./domain/css-plugin.ts";
import * as cssProcessor from "./domain/css-processor.ts";
import type { CssProcessor } from "./domain/css-processor.ts";
import * as fontOptimizer from "./domain/font-optimizer.ts";
import type { FontOptimizer } from "./domain/font-optimizer.ts";
import * as imageOptimizer from "./domain/image-optimizer.ts";
import type { ImageOptimizer } from "./domain/image-optimizer.ts";
import type { CSSModuleResult } from "./css-modules.ts";
import * as importMapResolverPlugin from "./import-map-resolver-plugin.ts";
import * as routeScanner from "./domain/route-scanner.ts";
import * as routeGenerator from "./domain/route-generator.ts";
import * as virtualSource from "./domain/virtual-source.ts";
import * as buildCache from "./domain/build-cache.ts";
import type { BuildCache } from "./domain/build-cache.ts";
import * as bundler from "./domain/bundler.ts";
import * as chunkManifest from "./domain/chunk-manifest.ts";
import * as settings from "./config.ts";
import * as cssModules from "./css-modules.ts";
import * as serverExternalsPlugin from "./server-externals-plugin.ts";

const buildLogger = logging.logger.getLogger(["laroux-bundler", "build"]);

// Constants
const MANIFEST_FILENAME = "manifest.json";
const MODULE_MAP_FILENAME = "module-map.json";
const SERVER_DIR = "server";
const CLIENT_DIR = "client";
const PUBLIC_DIR = "public";

/**
 * Project files besides the source and public directories whose changes make
 * a build stale: the laroux config and the import maps the bundler reads.
 */
const PROJECT_BUILD_INPUTS = [
  "laroux.config.ts",
  "package.json",
  "deno.json",
  "deno.jsonc",
];

/** Entries the staleness check skips: dependencies and hidden files. */
const STALENESS_SKIP_PATTERNS = [
  /(?:^|[\\/])node_modules$/,
  /(?:^|[\\/])\.[^\\/]*$/,
];

/**
 * Build context with all necessary dependencies
 */
export type BuildContext = {
  /** Build configuration */
  config: types.BuildConfig;
  /** Project root directory */
  projectRoot: string;
  /** Source directory */
  srcDir: string;
  /** Distribution/output directory */
  distDir: string;
  /** Client entry point path */
  clientEntry: string;
  /**
   * Chunk manifest file path, <distDir>/client/manifest.json. The build
   * writes it last, so it exists only after a build that succeeded.
   */
  chunkManifestFile: string;
  /** Build cache for incremental builds (watch mode) */
  cache?: BuildCache;
  /**
   * Backend for the server bundle (default and only value: "rolldown").
   */
  bundlerBackend?: BundlerBackend;
  /** Framework plugin for framework-specific build functionality */
  plugin: FrameworkPlugin;
  /** CSS plugin for CSS processing (Tailwind, UnoCSS, etc.) */
  cssPlugin?: CssPlugin;
  /** Transforms the global stylesheet when the CSS plugin does not compile it */
  cssProcessor: CssProcessor;
  /** Self-hosts the configured fonts */
  fontOptimizer: FontOptimizer;
  /** Optimizes the images under public/images */
  imageOptimizer: ImageOptimizer;
};

/**
 * Result of a build operation
 */
export type BuildResult = {
  /** Whether the build succeeded */
  success: boolean;
  /**
   * Id of the code in dist/. A build that bundles writes a new one into the
   * chunk manifest and the generated routes file; a CSS-only rebuild keeps
   * the code, so it reports the id of the build before it. The server adds
   * it to the URLs it imports dist/ modules by, so each build loads fresh.
   */
  buildId: string;
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
 * Users pass these explicitly when calling bundle functions. Each one left
 * out falls back to a no-op: no framework hooks, no CSS processing, no font
 * self-hosting, no image optimization.
 */
export type BuildPlugins = {
  /** Framework plugin for framework-specific build functionality (React, Vue, etc.) */
  framework?: FrameworkPlugin;
  /** CSS plugin for CSS processing (Tailwind, UnoCSS, etc.) */
  css?: CssPlugin;
  /**
   * Transforms the global stylesheet when the CSS plugin does not compile it,
   * such as lightningCssProcessor from adapters/lightningcss. Default: the
   * stylesheet is written as the CSS plugin's input left it.
   */
  cssProcessor?: CssProcessor;
  /**
   * Self-hosts the configured fonts, such as googleFontOptimizer from
   * adapters/fonts. Default: no font files are downloaded.
   */
  fontOptimizer?: FontOptimizer;
  /**
   * Optimizes the images under public/images, such as sharpImageOptimizer
   * from adapters/sharp. Default: images are served as they are.
   */
  imageOptimizer?: ImageOptimizer;
  /**
   * Backend for the server bundle (default and only value: "rolldown").
   */
  bundlerBackend?: BundlerBackend;
};

/**
 * Create build context from configuration
 * @param config - Build configuration
 * @param plugins - Plugins for framework, CSS, and bundler (explicit composition)
 * @returns Build context with all paths and dependencies
 */
export function createBuildContext(
  config: types.BuildConfig,
  plugins?: BuildPlugins,
): BuildContext {
  const projectRoot = config.projectRoot;
  const srcDir = config.srcDir;
  const distDir = config.distDir;
  // Client entry is no longer hardcoded - provided by the plugin
  const clientEntry = "";
  const chunkManifestFile = crossRuntime.runtime.path.resolve(
    distDir,
    CLIENT_DIR,
    MANIFEST_FILENAME,
  );

  return {
    config,
    projectRoot,
    srcDir,
    distDir,
    clientEntry,
    chunkManifestFile,
    bundlerBackend: plugins?.bundlerBackend,
    plugin: plugins?.framework ?? frameworkPlugin.noopPlugin,
    cssPlugin: plugins?.css,
    cssProcessor: plugins?.cssProcessor ?? cssProcessor.noopCssProcessor,
    fontOptimizer: plugins?.fontOptimizer ?? fontOptimizer.noopFontOptimizer,
    imageOptimizer:
      plugins?.imageOptimizer ?? imageOptimizer.noopImageOptimizer,
  };
}

/**
 * Main build function
 * Performs complete build: analyze → transform → bundle → generate maps
 * @param context - Build context with configuration and paths
 * @param options - Build options
 *   - skipCss: for JS-only changes; keeps styles.css and skips the global
 *     stylesheet, but still compiles the CSS modules the bundles import
 *   - cssOnly: for CSS-only changes; rewrites styles.css and the CSS derived
 *     from it as a full build does, and keeps the JavaScript and its build id
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
  const buildId = ulid.ulid();

  buildLogger.info(`🚀 Starting RSC build...`);
  buildLogger.debug(`🆔 Build ID: ${buildId}`);

  try {
    // CSS-only fast path for HMR: the JavaScript in dist/ stays as it is
    if (options?.cssOnly === true) {
      return await rebuildStylesheets(context, buildId, startTime);
    }

    // Step 1: Clean if requested (preserve CSS files when skipCss is true)
    await cleanBuildDir(distDir, options?.skipCss);

    // Step 2: Ensure dist directory exists
    await crossRuntime.runtime.fs.ensureDir(distDir);

    // Build timestamp will be written to chunk manifest at the end
    const buildTimestamp = Date.now();

    // Step 3: Parallel scan - routes, client components, and CSS modules
    // These operations are independent and can run concurrently for faster builds
    buildLogger.debug(
      "🔍 Step 3: Parallel scanning (routes, components, CSS modules)...",
    );
    const routesDir = crossRuntime.runtime.path.resolve(srcDir, "app/routes");
    const { plugin } = context;
    const [scanResult, clientComponents, cssModulePaths] = await Promise.all([
      routeScanner.scanRoutes(routesDir, projectRoot, { cache: context.cache }),
      plugin.analyzeClientComponents
        ? plugin.analyzeClientComponents(srcDir, projectRoot, context.cache)
        : Promise.resolve([]),
      scanCssModuleFiles(srcDir),
    ]);

    // Generate route files to dist/server/ (NOT src/) for build isolation
    const serverDir = crossRuntime.runtime.path.resolve(distDir, SERVER_DIR);
    await crossRuntime.runtime.fs.ensureDir(serverDir);
    const generatedRoutesPath = crossRuntime.runtime.path.resolve(
      serverDir,
      "_generated-routes.ts",
    );
    // Get srcDir name relative to project root (e.g., "src")
    const srcDirName = crossRuntime.runtime.path.relative(projectRoot, srcDir);
    await routeGenerator.generateRouteFile({
      scanResult,
      outputPath: generatedRoutesPath,
      projectRoot,
      srcDirName,
      moduleVersion: buildId,
    });
    buildLogger.debug(
      `✓ Generated ${scanResult.routes.length} page route(s) to dist/`,
    );

    // Generate API routes file if any exist
    if (scanResult.apiRoutes.length > 0) {
      const apiRoutesPath = crossRuntime.runtime.path.resolve(
        distDir,
        "server",
        "api-routes.ts",
      );
      await crossRuntime.runtime.fs.ensureDir(
        crossRuntime.runtime.path.dirname(apiRoutesPath),
      );
      await routeGenerator.generateApiRouteFile(
        scanResult,
        apiRoutesPath,
        projectRoot,
      );
      buildLogger.debug(
        `✓ Generated ${scanResult.apiRoutes.length} API route(s)`,
      );
    }

    // Generate proxy registry if any exist
    if (scanResult.proxies.length > 0) {
      const proxyPath = crossRuntime.runtime.path.resolve(
        distDir,
        "server",
        "proxy-registry.ts",
      );
      await crossRuntime.runtime.fs.ensureDir(
        crossRuntime.runtime.path.dirname(proxyPath),
      );
      await routeGenerator.generateProxyFile(
        scanResult,
        proxyPath,
        projectRoot,
      );
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
          crossRuntime.runtime.path.resolve(distDir, SERVER_DIR),
          projectRoot,
        )
      : [];

    // Generate transform manifest
    if (plugin.generateTransformManifest) {
      await plugin.generateTransformManifest(
        transformResults,
        crossRuntime.runtime.path.resolve(distDir, "transform-manifest.json"),
        projectRoot,
      );
    }

    // Step 5: Rewrite server component imports
    buildLogger.debug("✏️  Step 5: Rewriting server component imports...");
    const allComponents = plugin.getAllComponents
      ? await plugin.getAllComponents(srcDir)
      : [];
    const clientComponentPaths = new Set(
      clientComponents.map((c) => c.filePath),
    );
    const serverComponentPaths = allComponents.filter(
      (path) => !clientComponentPaths.has(path),
    );

    if (plugin.rewriteServerComponents) {
      await plugin.rewriteServerComponents(
        serverComponentPaths,
        transformResults,
        cssModulePaths,
        crossRuntime.runtime.path.resolve(distDir, SERVER_DIR),
        projectRoot,
      );
    }

    // Step 5b: Transform server actions to add React server reference symbols
    // This must happen AFTER server components are copied but BEFORE bundling
    buildLogger.debug(
      "🔄 Step 5b: Transforming server actions with React symbols...",
    );
    const serverDistDir = crossRuntime.runtime.path.resolve(
      distDir,
      SERVER_DIR,
    );
    const serverActionResults =
      await serverActionTransform.transformServerActions(serverDistDir);
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
    const clientOutputDir = crossRuntime.runtime.path.resolve(
      distDir,
      CLIENT_DIR,
    );
    await crossRuntime.runtime.fs.ensureDir(clientOutputDir);

    const moduleMap = plugin.createModuleMap
      ? await plugin.createModuleMap(clientComponents)
      : {};
    if (plugin.saveModuleMap) {
      await plugin.saveModuleMap(
        moduleMap,
        crossRuntime.runtime.path.resolve(clientOutputDir, MODULE_MAP_FILENAME),
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
      await processCssFiles({
        plugin: cssPlugin,
        processor: context.cssProcessor,
        srcDir,
        projectRoot,
        outputDir: clientOutputDir,
      });
    } else if (!cssPlugin) {
      buildLogger.debug("⏭️  No CSS plugin provided, skipping CSS processing");
    } else {
      buildLogger.debug("⏭️  Skipping CSS processing (JS-only change)");
    }

    // Step 8: Create virtual source for bundling (build isolation)
    // This copies src/ to dist/_bundle_src/ so we can modify imports without touching original source
    // In watch mode, only copy changed files for faster rebuilds
    buildLogger.debug("📁 Step 8: Creating virtual source for bundling...");
    const virtualSourceResult = await virtualSource.createVirtualSource({
      projectRoot,
      distDir,
      srcDir,
      changedFiles: options?.changedFiles,
    });
    const virtualSrcDir = virtualSourceResult.virtualSrcDir;

    // The virtual source is removed when this scope ends, whether the
    // bundling below succeeds or throws.
    let clientBundle: ClientBundle;
    try {
      // Step 8b: Generate client stubs for "use server" files in virtual source
      // This replaces server action files with client-side stubs that call /action
      // Must happen BEFORE client bundling so imports resolve to stubs
      buildLogger.debug(
        "🔌 Step 8b: Generating client action stubs in virtual source...",
      );
      const virtualSrcSubdirForStubs = crossRuntime.runtime.path.join(
        virtualSrcDir,
        srcDirName,
      );
      const clientStubResults =
        await clientActionStub.generateClientActionStubs(
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
      // Generate JSON files in the virtual source directory. A JS-only
      // rebuild (skipCss) needs them too: the bundles import a component's
      // class names from them, and without the rewrite in Step 10 the client
      // bundler meets a raw .module.css import and fails.
      // Map to store pre-processed CSS module results (translated to original paths)
      const cssModuleResults = new Map<string, CSSModuleResult>();

      if (cssModulePaths.length > 0) {
        buildLogger.debug(
          "🎨 Step 9: Processing CSS Modules to virtual source...",
        );

        // Translate CSS module paths to virtual source
        const virtualCssModulePaths = cssModulePaths.map((p) =>
          virtualSource.translateToVirtualPath(p, srcDir, virtualSrcDir),
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
            plugin: cssPlugin,
          },
        );

        // Translate virtual paths back to original paths for reuse in appendCssModulesToStyles
        // This avoids duplicate CSS module processing
        // Use srcDirName computed from config (e.g., "src") for virtual path translation
        const virtualSrcSubdir = crossRuntime.runtime.path.join(
          virtualSrcDir,
          srcDirName,
        );
        for (const [virtualPath, result] of virtualResults) {
          // Convert virtual path back to original path
          const relativePath = crossRuntime.runtime.path.relative(
            virtualSrcSubdir,
            virtualPath,
          );
          const originalPath = crossRuntime.runtime.path.resolve(
            srcDir,
            relativePath,
          );
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
      const virtualClientComponents = virtualSource.translateClientComponents(
        clientComponents,
        srcDir,
        virtualSrcDir,
      );
      clientBundle = await bundleClient(
        { ...context, srcDir: virtualSrcDir },
        virtualClientComponents,
        buildId,
        buildTimestamp,
      );

      // Step 12: Copy CSS Module JSON files from virtual source to dist/
      if (cssModulePaths.length > 0) {
        // Copy JSON files from virtual source to dist/client/
        buildLogger.debug(
          `📋 Step 12: Copying ${cssModulePaths.length} CSS Module JSON file(s) to client/...`,
        );
        await copyCssModuleJsonFilesFromSrc(
          cssModulePaths.map((p) =>
            virtualSource.translateToVirtualPath(p, srcDir, virtualSrcDir),
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
            virtualSource.translateToVirtualPath(p, srcDir, virtualSrcDir),
          ),
          virtualSrcDir,
          crossRuntime.runtime.path.resolve(distDir, SERVER_DIR),
        );

        // Append CSS module styles to main styles.css bundle. A JS-only
        // rebuild kept the styles.css of the build before it, which has them
        // already. Pass pre-processed results to avoid duplicate processing
        if (!options?.skipCss) {
          buildLogger.debug(
            "🎨 Step 14: Appending CSS modules to styles.css...",
          );
          await appendCssModulesToStyles(cssModuleResults, clientOutputDir);
        }
      }
    } finally {
      // Step 15: Clean up virtual source
      buildLogger.debug("🧹 Step 15: Cleaning up virtual source...");
      await virtualSourceResult.cleanup();
    }

    // Steps 16 and 17: Critical, deferred and universal CSS (requires CSS plugin)
    if (cssPlugin) {
      await writeDerivedStylesheets(cssPlugin, clientOutputDir);
    }

    // Step 18: Optimize fonts for self-hosting (output to client/)
    buildLogger.debug("🔤 Step 18: Optimizing Fonts...");
    await optimizeFonts(
      context.fontOptimizer,
      clientOutputDir,
      context.config.fonts,
    );

    // Step 19: Optimize images (WebP, AVIF, responsive variants)
    buildLogger.debug("🖼️  Step 19: Optimizing Images...");
    await optimizeImagesStep(
      context.imageOptimizer,
      projectRoot,
      clientOutputDir,
      context.config,
    );

    // Step 20: Copy translation JSON files to server directory
    buildLogger.debug("🌐 Step 20: Copying translation files...");
    await copyTranslationFiles(
      srcDir,
      crossRuntime.runtime.path.resolve(distDir, SERVER_DIR),
      projectRoot,
    );

    const serverOutputDir = crossRuntime.runtime.path.resolve(
      distDir,
      SERVER_DIR,
    );

    // Step 22: Bundle server components
    // This resolves all bare specifiers (react, lucide-react, etc.) via the bundler
    // instead of manual rewriting to npm: specifiers (which breaks Node.js)
    const serverBundlerBackend = context.bundlerBackend ?? "rolldown";
    buildLogger.info(
      `📦 Step 22: Server bundling check - components: ${serverComponentPaths.length}`,
    );
    if (serverComponentPaths.length > 0) {
      buildLogger.info(
        `📦 Step 22: Bundling ${serverComponentPaths.length} server component(s) with ${serverBundlerBackend}...`,
      );

      // Get server component files from dist/server (already copied with rewrites)
      // Files are in dist/server/src/... (preserving source directory structure)
      const candidatePaths = serverComponentPaths.map((srcPath) =>
        // "src/app/page.tsx" becomes "dist/server/src/app/page.tsx"
        crossRuntime.runtime.path.join(
          serverOutputDir,
          crossRuntime.runtime.path.relative(projectRoot, srcPath),
        ),
      );
      const candidateExists = await Promise.all(
        candidatePaths.map((distPath) =>
          crossRuntime.runtime.fs.exists(distPath),
        ),
      );
      const serverEntrypoints = candidatePaths.filter(
        (_, index) => candidateExists[index] === true,
      );

      buildLogger.info(
        `   Found ${serverEntrypoints.length} server entrypoints to bundle`,
      );

      if (serverEntrypoints.length > 0) {
        // Server externals from config (default: @eserstack/laroux, @eserstack/laroux-server)
        // These resolve from the app's node_modules at run time.
        // Everything else (react, lucide-react, etc.) gets bundled.
        // See ADR: 0002-bundler-external-import-specifiers.md
        const serverExternals = context.config.serverExternals;

        // Create server externals plugin with prefix matching for subpath imports
        // e.g., "@eserstack/laroux-server" matches "@eserstack/laroux-server/action-registry"
        // This ensures singleton modules like action-registry are shared between
        // bundled server components and the laroux-server runtime.
        const externalsPlugin =
          serverExternalsPlugin.createServerExternalsPlugin({
            externals: serverExternals,
          });

        // Rolldown bundles the server with platform: "node", running the
        // externals plugin so the listed packages stay imports
        const serverBundleResult = await bundler.bundleServerComponents(
          {
            entrypoints: serverEntrypoints,
            outputDir: serverOutputDir,
            projectRoot: serverOutputDir,
            sourcemap: false,
            minify: false,
            externals: serverExternals,
            plugins: [externalsPlugin],
          },
          serverBundlerBackend,
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
    const serverActionMatches = await directiveAnalysis.analyzeServerActions(
      srcDir,
      {
        projectRoot,
      },
    );
    // Convert source paths to bundled output paths:
    // Preserves full path structure (src/app/actions.ts → src/app/actions.js)
    const actionFiles = serverActionMatches.map((match) =>
      patterns.replaceJsExtension(match.relativePath, ".js"),
    );

    // Write actions manifest
    const actionsManifestPath = crossRuntime.runtime.path.resolve(
      serverOutputDir,
      "actions-manifest.json",
    );
    await crossRuntime.runtime.fs.writeTextFile(
      actionsManifestPath,
      JSON.stringify({ actions: actionFiles }, null, 2),
    );
    buildLogger.debug(
      `✓ Generated actions manifest: ${actionFiles.length} action file(s)`,
    );

    // Step 23: Copy public assets to dist root (server expects them there)
    await copyPublicAssets(projectRoot, distDir);

    // Step 24: Write the chunk manifest last. Its presence marks a build
    // that finished, which ensureBuildIsReady relies on to skip a build.
    await chunkManifest.saveChunkManifest(
      clientBundle.manifest,
      context.chunkManifestFile,
    );

    const duration = performance.now() - startTime;

    buildLogger.info(`📊 Build Summary:`);
    buildLogger.info(`   Client components: ${clientComponents.length}`);
    buildLogger.info(`   Build time: ${duration.toFixed(0)}ms`);

    return {
      success: true,
      buildId,
      clientBundle: crossRuntime.runtime.path.resolve(
        clientOutputDir,
        clientBundle.entrypoint,
      ),
      moduleMap,
      clientComponents: clientComponents.length,
      duration,
      timestamp: buildTimestamp,
    };
  } catch (error) {
    // The build handles every step's error here and logs it once, with the
    // whole cause chain; the steps return errors without logging them.
    buildLogger.with({ error }).error("❌ Build failed");
    return {
      success: false,
      buildId,
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
 *
 * The build is up to date when the chunk manifest of a finished build exists
 * and no build input changed after its timestamp: no file under the source
 * directory or public/ (at any depth, skipping node_modules and hidden
 * entries) and none of laroux.config.ts, package.json, deno.json and
 * deno.jsonc.
 * @param context - Build context with configuration and paths
 * @returns Build result; a skipped build returns the existing build's
 *   timestamp, module map and client bundle, with a duration of 0
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
  const manifest = await readChunkManifest(context.chunkManifestFile);
  if (manifest === null || typeof manifest.timestamp !== "number") {
    return true;
  }

  const changedFile = await findChangedBuildInput(context, manifest.timestamp);
  if (changedFile === null) {
    return false;
  }

  buildLogger.debug(
    `  Changed: ${crossRuntime.runtime.path.relative(
      context.projectRoot,
      changedFile,
    )}`,
  );
  return true;
}

/**
 * Read the chunk manifest a finished build wrote, or null when there is none
 * or it is not valid JSON (a build that was interrupted while writing it).
 */
async function readChunkManifest(
  chunkManifestFile: string,
): Promise<ChunkManifest | null> {
  let content: string;
  try {
    content = await crossRuntime.runtime.fs.readTextFile(chunkManifestFile);
  } catch (error) {
    if (error instanceof crossRuntime.NotFoundError) {
      return null;
    }
    throw error;
  }

  try {
    return JSON.parse(content) as ChunkManifest;
  } catch (error) {
    if (error instanceof SyntaxError) {
      buildLogger.debug(
        `  ${chunkManifestFile} is not valid JSON, so the build runs again`,
      );
      return null;
    }
    throw error;
  }
}

/**
 * Find a build input modified after the build at buildTimestamp.
 * @param context - Build context; its srcDir, projectRoot and distDir are read
 * @param buildTimestamp - Timestamp of the existing build, in milliseconds
 * @returns The path of one changed input, or null when every input is older
 */
async function findChangedBuildInput(
  context: BuildContext,
  buildTimestamp: number,
): Promise<string | null> {
  const { srcDir, projectRoot, distDir } = context;
  const [sourceFiles, publicFiles] = await Promise.all([
    listBuildInputFiles(srcDir, distDir),
    listBuildInputFiles(
      crossRuntime.runtime.path.resolve(projectRoot, PUBLIC_DIR),
      distDir,
    ),
  ]);
  const inputFiles = [
    ...sourceFiles,
    ...publicFiles,
    ...PROJECT_BUILD_INPUTS.map((name) =>
      crossRuntime.runtime.path.resolve(projectRoot, name),
    ),
  ];

  const modifiedTimes = await Promise.all(inputFiles.map(readModifiedTime));
  const changedIndex = modifiedTimes.findIndex(
    (mtime) => mtime !== null && mtime > buildTimestamp,
  );

  return changedIndex === -1 ? null : (inputFiles[changedIndex] ?? null);
}

/**
 * List every file under dir at any depth, except node_modules, hidden entries
 * and the output directory. A missing dir has no files.
 */
async function listBuildInputFiles(
  dir: string,
  distDir: string,
): Promise<string[]> {
  if (!(await crossRuntime.runtime.fs.exists(dir))) {
    return [];
  }

  const files: string[] = [];
  for await (const entry of crossRuntime.runtime.fs.walk(dir, {
    includeDirs: false,
    skip: STALENESS_SKIP_PATTERNS,
  })) {
    if (!buildValidator.isWithinOutputDir(entry.path, distDir)) {
      files.push(entry.path);
    }
  }
  return files;
}

/**
 * Modification time of a file in milliseconds, or null when it does not
 * exist or the file system reports none.
 */
async function readModifiedTime(filePath: string): Promise<number | null> {
  try {
    const fileStat = await crossRuntime.runtime.fs.stat(filePath);
    return fileStat.mtime?.getTime() ?? null;
  } catch (error) {
    // A file that no longer exists cannot be newer than the build
    if (error instanceof crossRuntime.NotFoundError) {
      return null;
    }
    throw error;
  }
}

/**
 * Load existing build result from manifest files
 * @param context - Build context
 * @returns Build result from previous successful build
 */
async function loadExistingBuild(context: BuildContext): Promise<BuildResult> {
  const { chunkManifestFile, distDir } = context;
  const clientOutputDir = crossRuntime.runtime.path.resolve(
    distDir,
    CLIENT_DIR,
  );

  const manifestContent =
    await crossRuntime.runtime.fs.readTextFile(chunkManifestFile);
  const manifest: ChunkManifest = JSON.parse(manifestContent);

  // A framework plugin without saveModuleMap writes no module map
  const moduleMapPath = crossRuntime.runtime.path.resolve(
    clientOutputDir,
    MODULE_MAP_FILENAME,
  );
  const moduleMap: ModuleMap = (await crossRuntime.runtime.fs.exists(
    moduleMapPath,
  ))
    ? JSON.parse(await crossRuntime.runtime.fs.readTextFile(moduleMapPath))
    : {};

  return {
    success: true,
    buildId: manifest.buildId,
    clientBundle: crossRuntime.runtime.path.resolve(
      clientOutputDir,
      manifest.entrypoint,
    ),
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
 * @param onChange - Callback invoked after each rebuild, including a failed
 *   one; check result.success before serving or announcing the result. The
 *   next rebuild waits for the promise it returns, so it can load the
 *   rebuilt output before dist/ changes again.
 * @returns File system watcher
 */
export function watch(
  context: BuildContext,
  onChange: (result: BuildResult) => void | Promise<void>,
): FsWatcher {
  const { srcDir, distDir, projectRoot } = context;
  buildLogger.debug("👁️  Watch mode enabled, monitoring for changes...");

  // The cache lives as long as this watcher, unless the caller passed one
  const cache = context.cache ?? new buildCache.BuildCache();
  const contextWithCache = { ...context, cache };

  // Compute relative dist directory path for filtering
  const relativeDistDir = crossRuntime.runtime.path.relative(
    projectRoot,
    distDir,
  );

  // Build list of paths to watch
  const watchPaths: string[] = [srcDir];

  const watcher = crossRuntime.runtime.fs.watch(watchPaths);

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
          changedFilesList.map((f) =>
            crossRuntime.runtime.path.resolve(projectRoot, f),
          ),
        );

        const hasCssChanges = changedFilesList.some((file) =>
          file.endsWith(".css"),
        );
        const hasJsChanges = changedFilesList.some((file) =>
          file.match(/\.(tsx?|jsx?)$/),
        );

        // Determine build mode:
        // - cssOnly: only CSS changed, use fast path (no JS rebuild)
        // - skipCss: only JS changed, skip CSS processing
        // - full build: both changed
        const cssOnly = hasCssChanges && !hasJsChanges;
        const skipCss = !hasCssChanges && hasJsChanges;

        // Convert changed files to absolute paths for incremental virtual source
        const changedFilesAbsolute = new Set(
          changedFilesList.map((f) =>
            crossRuntime.runtime.path.resolve(projectRoot, f),
          ),
        );

        // Builds write to the same dist directory, so they run one after
        // another; changes that arrive during a build wait for the next pass.
        // deno-lint-ignore no-await-in-loop
        const result = await build(contextWithCache, {
          skipCss,
          cssOnly,
          changedFiles: changedFilesAbsolute,
        });

        // Attach the files this build covered to the build result
        result.changedFiles = changedFilesList;

        // A failed build keeps its changed files, so the next change
        // rebuilds them too: a CSS change in a failed build is not skipped
        // by a later JS-only build. build() has logged the failure. Files
        // that changed during this build stay for the pending rebuild.
        if (result.success) {
          buildLogger.debug(
            `✅ Rebuild complete (${result.duration.toFixed(0)}ms)`,
          );
          for (const builtFile of changedFilesList) {
            changedFiles.delete(builtFile);
          }
        }

        // Sequential like the build above: the callback reads dist/, which
        // the next build rewrites.
        // deno-lint-ignore no-await-in-loop
        await onChange(result);
      } catch (error) {
        // build() reports its own failures in the result, so this is an
        // error thrown by onChange; the next change calls it again.
        buildLogger.with({ error }).error("❌ Rebuild callback failed");
      }
    } while (pendingRebuild);

    building = false;
  }

  (async () => {
    for await (const event of watcher) {
      if (
        event.kind === "modify" ||
        event.kind === "create" ||
        event.kind === "remove"
      ) {
        const eventPath = event.paths[0];
        if (!eventPath) continue;
        const changedFile = crossRuntime.runtime.path.relative(
          projectRoot,
          eventPath,
        );

        // Skip non-source files (tsx/jsx/css)
        if (!changedFile.match(/\.(tsx?|jsx?|css)$/)) continue;

        // Skip dist directory (build outputs shouldn't trigger rebuilds)
        // Convert to POSIX format for cross-platform path comparison
        const normalizedChangedFile = crossRuntime.toPosix(changedFile);
        const normalizedDistDir = crossRuntime.toPosix(relativeDistDir);
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

/** Output of the client bundling step. */
type ClientBundle = {
  /** Entry file of the client bundle, relative to <distDir>/client */
  readonly entrypoint: string;
  /** Chunk manifest; build() writes it once every other step succeeded */
  readonly manifest: ChunkManifest;
};

/**
 * Bundle client code with code splitting. Client bundles always use
 * rolldown (bundler.CLIENT_BUNDLER_BACKEND), whatever context.bundlerBackend
 * says: the import map resolver plugin, which applies config.browserShims, is
 * what keeps server-only modules such as @eserstack/logging out of the browser.
 * @param context - Build context
 * @param clientComponents - Array of client components to bundle
 * @param buildId - Unique build identifier
 * @param timestamp - Build timestamp
 * @returns The bundle's entry file and its chunk manifest, not yet written
 */
async function bundleClient(
  context: BuildContext,
  clientComponents: ClientComponent[],
  buildId: string,
  timestamp: number,
): Promise<ClientBundle> {
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
    // Bundle with code splitting, bundling the packages too
    // Pass ALL component files as entrypoints for proper code splitting
    // Deno will create separate chunks for each and extract shared deps (React) into common chunks
    const componentEntrypoints = clientComponents.map((c) => c.filePath);
    const clientOutputDir = crossRuntime.runtime.path.resolve(
      distDir,
      CLIENT_DIR,
    );

    // Create import map resolver plugin to handle all bare imports
    // Uses both deno.json and package.json for import resolution
    // autoMarkExternal: false ensures npm packages are bundled inline for browsers
    // (browsers can't resolve bare specifiers without an import map)
    const importMapPlugin =
      importMapResolverPlugin.createImportMapResolverPlugin({
        projectRoot,
        browserShims: config.browserShims,
        autoMarkExternal: false,
      });

    const define: Record<string, string> = {
      ...settings.PRODUCTION_SETTINGS.define,
    };

    const bundleResult = await bundler.bundle(
      {
        entrypoints: [generatedEntry, ...componentEntrypoints],
        outputDir: clientOutputDir,
        projectRoot,
        minify: settings.PRODUCTION_SETTINGS.minify,
        splitting: settings.PRODUCTION_SETTINGS.codeSplitting,
        platform: "browser",
        sourcemap: settings.PRODUCTION_SETTINGS.sourceMaps,
        plugins: [importMapPlugin],
        define,
      },
      clientComponents,
      bundler.CLIENT_BUNDLER_BACKEND,
    );

    // Generate chunk manifest (HMR disabled for non-runtime builds)
    const manifest = chunkManifest.generateChunkManifest(
      buildId,
      timestamp,
      bundleResult,
      clientComponents,
      config.logLevel,
      false, // hmrEnabled - false for prebuilt bundler
    );

    // Clean up generated entry file
    try {
      await crossRuntime.runtime.fs.remove(generatedEntry);
    } catch {
      // Ignore if file doesn't exist
    }

    bundler.logBundleStats(bundleResult);
    chunkManifest.logManifest(manifest);

    return { entrypoint: bundleResult.entrypoint, manifest };
  } catch (error) {
    // Clean up on error
    try {
      await crossRuntime.runtime.fs.remove(generatedEntry);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
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
  const publicDir = crossRuntime.runtime.path.resolve(projectRoot, "public");

  if (!(await crossRuntime.runtime.fs.exists(publicDir))) {
    return;
  }

  // Copy all files and directories recursively
  for await (const entry of crossRuntime.runtime.fs.readDir(publicDir)) {
    const sourcePath = crossRuntime.runtime.path.resolve(publicDir, entry.name);
    const destPath = crossRuntime.runtime.path.resolve(distDir, entry.name);
    await fs.copy(sourcePath, destPath, { overwrite: true });
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
  const srcDirName = crossRuntime.runtime.path.relative(projectRoot, srcDir);

  // Copy from {srcDir}/app/messages/ (legacy location)
  const appMessagesSourceDir = crossRuntime.runtime.path.resolve(
    srcDir,
    "app/messages",
  );
  const appMessagesDestDir = crossRuntime.runtime.path.resolve(
    serverDistDir,
    srcDirName,
    "app/messages",
  );

  if (await crossRuntime.runtime.fs.exists(appMessagesSourceDir)) {
    await crossRuntime.runtime.fs.ensureDir(appMessagesDestDir);
    for await (const entry of crossRuntime.runtime.fs.readDir(
      appMessagesSourceDir,
    )) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const sourcePath = crossRuntime.runtime.path.resolve(
          appMessagesSourceDir,
          entry.name,
        );
        const destPath = crossRuntime.runtime.path.resolve(
          appMessagesDestDir,
          entry.name,
        );
        await fs.copy(sourcePath, destPath, { overwrite: true });
        totalCopied++;
      }
    }
  }

  // Copy from {srcDir}/lib/i18n/messages/ (loader.ts location)
  const i18nMessagesSourceDir = crossRuntime.runtime.path.resolve(
    srcDir,
    "lib/i18n/messages",
  );
  const i18nMessagesDestDir = crossRuntime.runtime.path.resolve(
    serverDistDir,
    srcDirName,
    "lib/i18n/messages",
  );

  if (await crossRuntime.runtime.fs.exists(i18nMessagesSourceDir)) {
    await crossRuntime.runtime.fs.ensureDir(i18nMessagesDestDir);
    for await (const entry of crossRuntime.runtime.fs.readDir(
      i18nMessagesSourceDir,
    )) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const sourcePath = crossRuntime.runtime.path.resolve(
          i18nMessagesSourceDir,
          entry.name,
        );
        const destPath = crossRuntime.runtime.path.resolve(
          i18nMessagesDestDir,
          entry.name,
        );
        await fs.copy(sourcePath, destPath, { overwrite: true });
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

/** Inputs of {@link processCssFiles}. */
type ProcessCssFilesOptions = {
  /** CSS plugin that compiles the stylesheet when it claims it */
  readonly plugin: CssPlugin;
  /** Processor for a stylesheet the plugin does not compile */
  readonly processor: CssProcessor;
  /** Source directory (absolute path) */
  readonly srcDir: string;
  /** Project root directory */
  readonly projectRoot: string;
  /** Directory styles.css is written to */
  readonly outputDir: string;
};

/**
 * Compile the global stylesheet, {srcDir}/app/styles/global.css, into
 * styles.css: the CSS plugin compiles it when it claims it, otherwise the CSS
 * processor transforms it.
 * @param options - Plugin, processor and directories
 * @returns Whether styles.css was written; false when there is no global
 *   stylesheet
 */
async function processCssFiles(
  options: ProcessCssFilesOptions,
): Promise<boolean> {
  const { plugin, processor, srcDir, projectRoot, outputDir } = options;
  const cssInput = crossRuntime.runtime.path.resolve(
    srcDir,
    "app/styles/global.css",
  );
  const cssOutput = crossRuntime.runtime.path.resolve(outputDir, "styles.css");

  // Check if CSS source file exists
  if (!(await crossRuntime.runtime.fs.exists(cssInput))) {
    buildLogger.debug("No CSS source file found, skipping CSS processing");
    return false;
  }

  const source = await crossRuntime.runtime.fs.readTextFile(cssInput);

  let compiled: string;
  try {
    compiled = await cssProcessor.compileStylesheet(source, {
      plugin,
      processor,
      context: { projectRoot, cssPath: cssInput, isModule: false },
      minify: true,
    });
  } catch (error) {
    // Not logged here: build() logs the error once, with its cause chain
    const message = error instanceof Error ? error.message : String(error);
    throw types.buildErrors.cssError(`${cssInput}: ${message}`, {
      cause: error,
    });
  }

  await crossRuntime.runtime.fs.ensureDir(outputDir);
  await crossRuntime.runtime.fs.writeTextFile(cssOutput, compiled);
  buildLogger.debug(`✓ CSS processed with ${processor.name}`);
  return true;
}

/**
 * Rebuild only the stylesheets, for a change that touched nothing but CSS.
 * styles.css comes out as a full build writes it, the compiled global
 * stylesheet followed by the CSS module styles, and the critical, deferred
 * and universal CSS are derived from it again, since the pages load those.
 * The JavaScript in dist/ stays, and so does its build id.
 * @param context - Build context
 * @param newBuildId - Id reported when dist/ holds no finished build yet
 * @param startTime - When the build started, from performance.now()
 * @returns Build result with the build id of the code in dist/
 */
async function rebuildStylesheets(
  context: BuildContext,
  newBuildId: string,
  startTime: number,
): Promise<BuildResult> {
  const { srcDir, projectRoot, distDir, cssPlugin } = context;
  buildLogger.debug("⚡ CSS-only rebuild (fast path)");
  const timestamp = Date.now();
  const clientOutputDir = crossRuntime.runtime.path.resolve(
    distDir,
    CLIENT_DIR,
  );
  const codeManifest = await readChunkManifest(context.chunkManifestFile);

  // The CSS modules are compiled before styles.css is touched, so a module
  // that fails to compile leaves the previous styles.css in place.
  const cssModulePaths = await scanCssModuleFiles(srcDir);
  const cssModuleResults =
    cssModulePaths.length > 0
      ? await processCssModulesFiles(
          projectRoot,
          clientOutputDir,
          context.config,
          {
            skipCss: true,
            cssModulePaths,
            cache: context.cache,
            plugin: cssPlugin,
          },
        )
      : new Map<string, CSSModuleResult>();

  const wroteGlobalStyles =
    cssPlugin !== undefined &&
    (await processCssFiles({
      plugin: cssPlugin,
      processor: context.cssProcessor,
      srcDir,
      projectRoot,
      outputDir: clientOutputDir,
    }));
  if (!wroteGlobalStyles) {
    // As in a full build, the CSS module styles then make up styles.css on
    // their own; appending them to the previous file would repeat them.
    await removeFileIfExists(
      crossRuntime.runtime.path.resolve(clientOutputDir, "styles.css"),
    );
  }

  await appendCssModulesToStyles(cssModuleResults, clientOutputDir);

  if (cssPlugin !== undefined) {
    await writeDerivedStylesheets(cssPlugin, clientOutputDir);
  }

  const duration = performance.now() - startTime;
  buildLogger.info(`⚡ CSS rebuild completed (${duration.toFixed(0)}ms)`);

  return {
    success: true,
    buildId: codeManifest?.buildId ?? newBuildId,
    clientBundle: "", // Preserved from previous build
    moduleMap: {}, // Preserved from previous build
    clientComponents: 0,
    duration,
    timestamp,
  };
}

/**
 * Remove a file; a file that does not exist is already removed.
 */
async function removeFileIfExists(filePath: string): Promise<void> {
  try {
    await crossRuntime.runtime.fs.remove(filePath);
  } catch (error) {
    if (!(error instanceof crossRuntime.NotFoundError)) {
      throw error;
    }
  }
}

/**
 * Derive the critical, deferred and universal CSS from styles.css with the
 * CSS plugin (build steps 16 and 17). Each is optional: when the plugin
 * cannot derive one, pages load the full styles.css instead.
 * @param cssPlugin - CSS plugin that extracts the critical and universal CSS
 * @param clientOutputDir - Client output directory containing styles.css
 */
async function writeDerivedStylesheets(
  cssPlugin: CssPlugin,
  clientOutputDir: string,
): Promise<void> {
  // Step 16: Extract critical CSS for faster initial render
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

  const stylesPath = crossRuntime.runtime.path.resolve(distDir, "styles.css");

  // Check if styles.css exists
  if (!(await crossRuntime.runtime.fs.exists(stylesPath))) {
    buildLogger.debug("No styles.css found, skipping critical CSS extraction");
    return null;
  }

  try {
    const fullCss = await crossRuntime.runtime.fs.readTextFile(stylesPath);

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
    const criticalPath = crossRuntime.runtime.path.resolve(
      distDir,
      "styles.critical.css",
    );
    const deferredPath = crossRuntime.runtime.path.resolve(
      distDir,
      "styles.deferred.css",
    );

    await crossRuntime.runtime.fs.writeTextFile(criticalPath, result.critical);
    await crossRuntime.runtime.fs.writeTextFile(deferredPath, result.deferred);

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
    // Non-fatal: pages fall back to loading the full stylesheet
    buildLogger
      .with({ error })
      .warn("Critical CSS extraction failed, loading full CSS instead");
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

  const stylesPath = crossRuntime.runtime.path.resolve(distDir, "styles.css");

  // Check if styles.css exists
  if (!(await crossRuntime.runtime.fs.exists(stylesPath))) {
    buildLogger.debug("No styles.css found, skipping universal CSS generation");
    return null;
  }

  try {
    const compiledCss = await crossRuntime.runtime.fs.readTextFile(stylesPath);

    // Use plugin's extractUniversalCss method
    const result = plugin.extractUniversalCss(compiledCss);

    // Save universal CSS
    const universalPath = crossRuntime.runtime.path.resolve(
      distDir,
      "styles.universal.css",
    );
    await crossRuntime.runtime.fs.writeTextFile(universalPath, result.css);

    buildLogger.debug(`✓ Universal CSS generated: ${result.css.length} bytes`);

    return universalPath;
  } catch (error) {
    // Non-fatal: the server falls back to its default universal CSS
    buildLogger
      .with({ error })
      .warn("Universal CSS generation failed, using the default instead");
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
  if (!(await crossRuntime.runtime.fs.exists(distDir))) {
    return;
  }

  if (preserveCss) {
    // Selective cleanup: preserve CSS files in client directory
    buildLogger.debug("🧹 Cleaning build directory (preserving CSS)");

    // Remove server directory completely
    const serverDir = crossRuntime.runtime.path.resolve(distDir, SERVER_DIR);
    if (await crossRuntime.runtime.fs.exists(serverDir)) {
      await crossRuntime.runtime.fs.remove(serverDir, { recursive: true });
    }

    // Clean client directory but preserve CSS files
    const clientDir = crossRuntime.runtime.path.resolve(distDir, CLIENT_DIR);
    if (await crossRuntime.runtime.fs.exists(clientDir)) {
      for await (const entry of crossRuntime.runtime.fs.readDir(clientDir)) {
        // Preserve CSS files and font directories
        if (
          entry.name.endsWith(".css") ||
          entry.name === "fonts" ||
          entry.name === "fonts.css" ||
          entry.name === "font-preloads.json"
        ) {
          continue;
        }

        const entryPath = crossRuntime.runtime.path.resolve(
          clientDir,
          entry.name,
        );
        await crossRuntime.runtime.fs.remove(entryPath, { recursive: true });
      }
    }
  } else {
    // Full cleanup
    await crossRuntime.runtime.fs.remove(distDir, { recursive: true });
    buildLogger.debug("🧹 Cleaned build directory");
  }
}

/**
 * Self-host the configured fonts with the font optimizer, and write the
 * @font-face rules to fonts.css and the preload hints to font-preloads.json
 * @param optimizer - Font optimizer from the build plugins
 * @param distDir - Client output directory
 * @param fontDefinitions - Font configuration
 */
async function optimizeFonts(
  optimizer: FontOptimizer,
  distDir: string,
  fontDefinitions: readonly types.FontDefinition[],
): Promise<void> {
  if (fontDefinitions.length === 0) {
    buildLogger.debug("✓ No fonts configured, skipping font optimization");
    return;
  }

  const fontsDir = crossRuntime.runtime.path.resolve(distDir, "fonts");
  const publicPath = "/fonts";

  try {
    const result = await optimizer.optimize(fontDefinitions, {
      outputDir: fontsDir,
      publicPath,
    });

    if (result === null) {
      buildLogger.debug(
        `✓ Font optimizer ${optimizer.name} handles none of the configured fonts, skipping`,
      );
      return;
    }

    // Save font CSS to a file that can be inlined in HTML
    const fontCssPath = crossRuntime.runtime.path.resolve(distDir, "fonts.css");
    await crossRuntime.runtime.fs.writeTextFile(
      fontCssPath,
      result.fontFaceCss,
    );

    // Save preload hints to a file for HTML shell integration
    const preloadHintsPath = crossRuntime.runtime.path.resolve(
      distDir,
      "font-preloads.json",
    );
    await crossRuntime.runtime.fs.writeTextFile(
      preloadHintsPath,
      JSON.stringify(result.preloadHints, null, 2),
    );

    buildLogger.debug(
      `✓ Fonts optimized: ${result.fileCount} file(s), ${(
        result.totalSize / 1024
      ).toFixed(2)} KB`,
    );
  } catch (error) {
    // Font optimization is optional, so the build continues without it
    buildLogger
      .with({ error })
      .warn("Font optimization failed, continuing without it");
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
    for await (const entry of crossRuntime.runtime.fs.readDir(dir)) {
      const fullPath = crossRuntime.runtime.path.resolve(dir, entry.name);

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
  config: types.BuildConfig,
  options?: {
    skipCss?: boolean;
    cssModulePaths?: string[];
    cache?: BuildCache;
    /** CSS plugin that preprocesses each module, such as Tailwind's @apply */
    plugin?: CssPlugin;
  },
): Promise<Map<string, CSSModuleResult>> {
  // Use pre-scanned paths if provided, otherwise scan using config.srcDir
  const cssModuleFiles =
    options?.cssModulePaths ?? (await scanCssModuleFiles(config.srcDir));

  if (cssModuleFiles.length === 0) {
    buildLogger.debug("No CSS modules found, skipping CSS module processing");
    return new Map();
  }

  buildLogger.debug(`Found ${cssModuleFiles.length} CSS module(s)`);

  try {
    // Process all CSS modules
    const results = await cssModules.processCSSModules(cssModuleFiles, {
      generateDTS: config.cssModuleTypes,
      projectRoot,
      cache: options?.cache,
      plugin: options?.plugin,
      injectReference: !config.noCssModuleAutoReference,
    });

    // Save outputs to output directory (JSON files for bundler resolution)
    // When skipCss is true, only save JSON files (not processed CSS)
    for (const [cssPath, result] of results) {
      // One module's files at a time keeps open file handles bounded; a
      // project can have more CSS modules than the open-file limit.
      // deno-lint-ignore no-await-in-loop
      await cssModules.saveCSSModuleOutputs(cssPath, result, distDir, {
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
    const message = error instanceof Error ? error.message : String(error);
    throw types.buildErrors.cssError(
      `${cssModuleFiles.length} CSS module(s): ${message}`,
      { cause: error },
    );
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
    // One copy at a time keeps open file handles bounded; a project can have
    // more CSS modules than the open-file limit.
    // deno-lint-ignore no-await-in-loop
    const copied = await copyCssModuleJsonFile(cssPath, projectRoot, targetDir);
    if (copied) {
      copiedCount++;
    }
  }

  if (copiedCount > 0) {
    buildLogger.debug(`✓ Copied ${copiedCount} CSS module JSON file(s)`);
  }
}

/**
 * Copy the JSON file of one CSS module from src/ to a target directory
 * @param cssPath - Source CSS module path
 * @param projectRoot - Project root directory
 * @param targetDir - Target directory to copy the JSON file to
 * @returns Whether the file was copied; a failed copy is logged as a warning
 */
async function copyCssModuleJsonFile(
  cssPath: string,
  projectRoot: string,
  targetDir: string,
): Promise<boolean> {
  // Get relative path from project root
  const relativePath = crossRuntime.runtime.path.relative(projectRoot, cssPath);

  // Construct JSON file paths
  const jsonFilename = crossRuntime.runtime.path.basename(cssPath) + ".json";
  const sourceJsonPath = crossRuntime.runtime.path.join(
    projectRoot,
    crossRuntime.runtime.path.dirname(relativePath),
    jsonFilename,
  );
  const targetJsonPath = crossRuntime.runtime.path.join(
    targetDir,
    crossRuntime.runtime.path.dirname(relativePath),
    jsonFilename,
  );

  // Ensure target directory exists
  await crossRuntime.runtime.fs.ensureDir(
    crossRuntime.runtime.path.dirname(targetJsonPath),
  );

  // Copy JSON file
  try {
    await fs.copy(sourceJsonPath, targetJsonPath, { overwrite: true });
    return true;
  } catch (error) {
    buildLogger
      .with({ error })
      .warn(`copy the CSS module class map of ${relativePath}; skipping it`);
    return false;
  }
}

/**
 * Append CSS module styles to the main styles.css bundle
 * @param results - The CSS modules processed earlier in the build, so none is
 *   processed twice
 * @param clientOutputDir - Client output directory containing styles.css
 */
async function appendCssModulesToStyles(
  results: ReadonlyMap<string, { readonly code: string }>,
  clientOutputDir: string,
): Promise<void> {
  // Collect processed CSS content
  const cssModuleContents: string[] = [];
  for (const [, result] of results) {
    cssModuleContents.push(result.code);
  }

  // Append CSS module styles to main styles.css bundle
  if (cssModuleContents.length > 0) {
    const stylesPath = crossRuntime.runtime.path.resolve(
      clientOutputDir,
      "styles.css",
    );
    let existingStyles = "";
    try {
      existingStyles = await crossRuntime.runtime.fs.readTextFile(stylesPath);
    } catch {
      // styles.css doesn't exist yet, that's fine
    }
    // Strip ANSI color codes from both existing styles and CSS module contents
    // deno-lint-ignore no-control-regex
    existingStyles = existingStyles.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
    const cleanedContents = cssModuleContents.map((content) =>
      // deno-lint-ignore no-control-regex
      content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ""),
    );
    const combinedStyles = existingStyles + "\n" + cleanedContents.join("\n");
    await crossRuntime.runtime.fs.writeTextFile(stylesPath, combinedStyles);
    buildLogger.debug(
      `✓ Appended ${cssModuleContents.length} CSS module(s) to styles.css`,
    );
  }
}

/**
 * Optimize images for production with the image optimizer: the images under
 * public/images become responsive variants in the configured formats
 * @param optimizer - Image optimizer from the build plugins
 * @param projectRoot - Project root directory
 * @param distDir - Client output directory
 * @param config - Build configuration
 */
async function optimizeImagesStep(
  optimizer: ImageOptimizer,
  projectRoot: string,
  distDir: string,
  config: types.BuildConfig,
): Promise<void> {
  const imagesInputDir = crossRuntime.runtime.path.resolve(
    projectRoot,
    PUBLIC_DIR,
    "images",
  );

  // Check if images directory exists
  if (!(await crossRuntime.runtime.fs.exists(imagesInputDir))) {
    buildLogger.debug(
      "✓ No images directory found, skipping image optimization",
    );
    return;
  }

  try {
    const manifest = await optimizer.optimize({
      inputDir: imagesInputDir,
      outputDir: crossRuntime.runtime.path.resolve(distDir, "images"),
      publicPath: "/images",
      config: config.images,
    });

    if (manifest === null) {
      buildLogger.debug(
        `✓ Image optimizer ${optimizer.name} optimizes no images, skipping`,
      );
      return;
    }

    const imageCount = Object.keys(manifest.images).length;
    buildLogger.debug(`✓ Optimized ${imageCount} image(s)`);
  } catch (error) {
    // Image optimization is optional, so the build continues without it
    buildLogger
      .with({ error })
      .warn("Image optimization failed, continuing without it");
  }
}
