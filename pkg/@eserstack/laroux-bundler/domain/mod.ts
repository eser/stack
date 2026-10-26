// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Domain Layer
 *
 * Contains pure business logic and port interfaces/types.
 * Adapters implement the interfaces defined here.
 */

// Port interfaces - adapters implement these
export type {
  ClientComponent,
  FrameworkPlugin,
  ModuleMap,
  ModuleMapEntry,
  TransformResult,
} from "./framework-plugin.ts";
export { noopPlugin } from "./framework-plugin.ts";

export type {
  CriticalCssResult,
  CssPlugin,
  CssPluginContext,
  CssPluginOptions,
  UniversalCssResult,
} from "./css-plugin.ts";

export type { CssProcessor, CssProcessorOptions } from "./css-processor.ts";
export { noopCssProcessor } from "./css-processor.ts";

export type {
  FontOptimizationOptions,
  FontOptimizer,
  OptimizedFonts,
} from "./font-optimizer.ts";
export { noopFontOptimizer } from "./font-optimizer.ts";

export type {
  ImageManifest,
  ImageOptimizationRequest,
  ImageOptimizer,
  ImageVariant,
  OptimizedImage,
} from "./image-optimizer.ts";
export { noopImageOptimizer } from "./image-optimizer.ts";

export type {
  BundleData,
  BundleOptions,
  BundleOutput,
  Bundler,
  BundleResult,
  ServerBundleOptions,
  ServerBundleResult,
} from "./bundler.ts";
export {
  analyzeBundleResult,
  bundle,
  bundleServerComponents,
  logBundleStats,
} from "./bundler.ts";

// Domain types
export type {
  BaseChunkInfo,
  BaseChunkManifest,
  ChunkManifest,
  ComponentChunkInfo,
  FileInfo,
} from "./chunk-manifest.ts";
export {
  ChunkManifestError,
  generateChunkManifest,
  loadChunkManifest,
  logManifest,
  saveChunkManifest,
} from "./chunk-manifest.ts";

export type {
  ClientComponentCache,
  ClientComponentCacheEntry,
  CSSModuleCacheEntry,
  RouteCacheEntry,
} from "./build-cache.ts";
export { BuildCache } from "./build-cache.ts";

export type {
  RouteScanCache,
  ScannedProxy,
  ScannedRoute,
  ScanResult,
  ScanRoutesOptions,
} from "./route-scanner.ts";
export {
  getComponentName,
  getLayoutName,
  scanRoutes,
} from "./route-scanner.ts";

export {
  generateApiRouteFile,
  generateProxyFile,
  generateRouteFile,
} from "./route-generator.ts";

export type {
  VirtualSourceOptions,
  VirtualSourceResult,
} from "./virtual-source.ts";
export {
  createVirtualSource,
  translateClientComponents,
  translateFromVirtualPath,
  translateToVirtualPath,
  VIRTUAL_SRC_DIR,
} from "./virtual-source.ts";

export type { BuildIsolationReport, FileViolation } from "./build-validator.ts";
export {
  BuildIsolationError,
  cleanSrcArtifacts,
  createIsolatedWriter,
  isWithinOutputDir,
  validateBuildIsolation,
} from "./build-validator.ts";

export type { ImportMap, ImportMapEntry } from "./import-map.ts";
export {
  getExternals,
  isExternal,
  loadImportMap,
  resolveSpecifier,
} from "./import-map.ts";

export type { ServerActionTransformResult } from "./server-action-transform.ts";
export {
  transformServerActionFile,
  transformServerActions,
} from "./server-action-transform.ts";
