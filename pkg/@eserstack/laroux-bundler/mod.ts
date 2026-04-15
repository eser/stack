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
 * import { createBuildContext, build } from "@eserstack/laroux-bundler";
 * import { reactPlugin } from "@eserstack/laroux-bundler/adapters/react";
 * import { createTailwindPlugin } from "@eserstack/laroux-bundler/adapters/tailwindcss";
 *
 * const context = createBuildContext(config, {
 *   framework: reactPlugin,
 *   css: createTailwindPlugin({ globalCssPath: "src/styles/global.css" }),
 *   bundlerBackend: "deno-bundler",
 * });
 *
 * await build(context);
 * ```
 *
 * ## Available Adapters
 *
 * - `@eserstack/laroux-bundler/adapters/react` - React Server Components
 * - `@eserstack/laroux-bundler/adapters/tailwindcss` - Tailwind CSS v4
 * - `@eserstack/laroux-bundler/adapters/lightningcss` - LightningCSS processor
 * - `@eserstack/laroux-bundler/adapters/sharp` - Image optimization
 * - `@eserstack/laroux-bundler/adapters/fonts` - Font optimization
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
  ClientComponentCacheEntry,
  ComponentChunkInfo,
  CriticalCssResult,
  CSSModuleCacheEntry,
  CssPlugin,
  CssPluginContext,
  CssPluginOptions,
  FileInfo,
  FileViolation,
  FrameworkPlugin,
  ImportMap,
  ImportMapEntry,
  ModuleMap,
  ModuleMapEntry,
  RouteCacheEntry,
  ScannedProxy,
  ScannedRoute,
  ScanResult,
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
  bundle,
  bundleServerComponents,
  cleanSrcArtifacts,
  createIsolatedWriter,
  createVirtualSource,
  generateApiRouteFile,
  generateChunkManifest,
  generateProxyFile,
  generateRouteFile,
  getComponentName,
  getExternals,
  getGlobalBuildCache,
  getLayoutName,
  invalidateRouteCache,
  isExternal,
  isWithinOutputDir,
  loadChunkManifest,
  loadImportMap,
  logBundleStats,
  logManifest,
  noopPlugin,
  resetGlobalBuildCache,
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
