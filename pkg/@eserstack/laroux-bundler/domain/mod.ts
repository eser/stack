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
  generateChunkManifest,
  loadChunkManifest,
  logManifest,
  saveChunkManifest,
} from "./chunk-manifest.ts";

export type {
  ClientComponentCacheEntry,
  CSSModuleCacheEntry,
  RouteCacheEntry,
} from "./build-cache.ts";
export {
  BuildCache,
  getGlobalBuildCache,
  resetGlobalBuildCache,
} from "./build-cache.ts";

export type {
  ScannedProxy,
  ScannedRoute,
  ScanResult,
} from "./route-scanner.ts";
export {
  getComponentName,
  getLayoutName,
  invalidateRouteCache,
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
