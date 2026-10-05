// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * @eserstack/laroux-bundler
 *
 * Framework-agnostic build system with hexagonal architecture.
 *
 * ## Architecture
 *
 * - **Domain**: Core interfaces and business logic (`./domain/mod.ts`)
 * - **Adapters**: Framework/tool implementations (`./adapters/mod.ts`)
 *
 * ## Usage - Explicit Composition
 *
 * Import adapters explicitly and pass to build functions.
 * This ensures tree-shaking works, dependencies are visible, and types are checked.
 *
 * ```typescript
 * import * as larouxBundler from "@eserstack/laroux-bundler";
 * import * as fonts from "@eserstack/laroux-bundler/adapters/fonts";
 * import * as lightningcss from "@eserstack/laroux-bundler/adapters/lightningcss";
 * import * as react from "@eserstack/laroux-bundler/adapters/react";
 * import * as sharp from "@eserstack/laroux-bundler/adapters/sharp";
 * import * as tailwindcss from "@eserstack/laroux-bundler/adapters/tailwindcss";
 *
 * async function buildApp(config: larouxBundler.BuildConfig) {
 *   const context = larouxBundler.createBuildContext(config, {
 *     framework: react.reactPlugin,
 *     css: tailwindcss.createTailwindPlugin(),
 *     cssProcessor: lightningcss.lightningCssProcessor,
 *     fontOptimizer: fonts.googleFontOptimizer,
 *     imageOptimizer: sharp.sharpImageOptimizer,
 *     bundlerBackend: "deno-bundler",
 *   });
 *
 *   return await larouxBundler.build(context);
 * }
 * ```
 *
 * ## Available Adapters
 *
 * - `@eserstack/laroux-bundler/adapters/react` - React Server Components
 * - `@eserstack/laroux-bundler/adapters/tailwindcss` - Tailwind CSS v4
 * - `@eserstack/laroux-bundler/adapters/lightningcss` - LightningCSS processor (`lightningCssProcessor`)
 * - `@eserstack/laroux-bundler/adapters/sharp` - Image optimization (`sharpImageOptimizer`)
 * - `@eserstack/laroux-bundler/adapters/fonts` - Font optimization (`googleFontOptimizer`)
 * - `@eserstack/laroux-bundler/adapters/runtime-bundler` - Dev mode runtime bundler
 * - `@eserstack/laroux-bundler/adapters/prebuilt-bundler` - Production prebuilt bundler
 */

// Re-export domain types and interfaces
export type {
  BaseChunkInfo,
  BaseChunkManifest,
  BuildIsolationReport,
  BundleData,
  BundleOptions,
  BundleOutput,
  Bundler,
  BundleResult,
  ChunkManifest,
  ClientComponent,
  ClientComponentCache,
  ClientComponentCacheEntry,
  ComponentChunkInfo,
  CriticalCssResult,
  CSSModuleCacheEntry,
  CssPlugin,
  CssPluginContext,
  CssPluginOptions,
  CssProcessor,
  CssProcessorOptions,
  FileInfo,
  FileViolation,
  FontOptimizationOptions,
  FontOptimizer,
  FrameworkPlugin,
  ImageManifest,
  ImageOptimizationRequest,
  ImageOptimizer,
  ImageVariant,
  ImportMap,
  ImportMapEntry,
  ModuleMap,
  ModuleMapEntry,
  OptimizedFonts,
  OptimizedImage,
  RouteCacheEntry,
  RouteScanCache,
  ScannedProxy,
  ScannedRoute,
  ScanResult,
  ScanRoutesOptions,
  ServerActionTransformResult,
  ServerBundleOptions,
  ServerBundleResult,
  TransformResult,
  UniversalCssResult,
  VirtualSourceOptions,
  VirtualSourceResult,
} from "./domain/mod.ts";
export {
  analyzeBundleResult,
  BuildCache,
  BuildIsolationError,
  bundle,
  bundleServerComponents,
  ChunkManifestError,
  cleanSrcArtifacts,
  createIsolatedWriter,
  createVirtualSource,
  generateApiRouteFile,
  generateChunkManifest,
  generateProxyFile,
  generateRouteFile,
  getComponentName,
  getExternals,
  getLayoutName,
  isExternal,
  isWithinOutputDir,
  loadChunkManifest,
  loadImportMap,
  logBundleStats,
  logManifest,
  noopCssProcessor,
  noopFontOptimizer,
  noopImageOptimizer,
  noopPlugin,
  resolveSpecifier,
  saveChunkManifest,
  scanRoutes,
  transformServerActionFile,
  transformServerActions,
  translateClientComponents,
  translateFromVirtualPath,
  translateToVirtualPath,
  validateBuildIsolation,
  VIRTUAL_SRC_DIR,
} from "./domain/mod.ts";

// Re-export build system
export {
  build,
  type BuildContext,
  type BuildPlugins,
  type BuildResult,
  createBuildContext,
  ensureBuildIsReady,
  watch,
} from "./system.ts";

// Re-export configuration
export type { BuildSettings, BundlerBackend } from "./config.ts";
export { DEVELOPMENT_SETTINGS, PRODUCTION_SETTINGS } from "./config.ts";

export type { BuildConfig } from "./types.ts";
export type {
  FontDefinition,
  FontDisplay,
  FontProvider,
  FontStyle,
  FontWeight,
  ImageFormat,
  ImageOutputFormat,
  ImagePlaceholder,
  LogLevel,
  ResolvedBrowserShimsConfig,
  ResolvedImageConfig,
  ResolvedImageQuality,
} from "./types.ts";
export { BuildError, buildErrors } from "./types.ts";

// Re-export bundler plugins
export {
  createServerExternalsPlugin,
  type ServerExternalsPluginOptions,
} from "./server-externals-plugin.ts";
export {
  createImportMapResolverPlugin,
  type ImportMapResolverOptions,
} from "./import-map-resolver-plugin.ts";
