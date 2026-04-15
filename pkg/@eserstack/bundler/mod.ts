// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Core types and abstractions
export {
  type BundleError,
  type BundleMetafile,
  type BundleOutput,
  type Bundler,
  type BundlerBackend,
  type BundlerConfig,
  type BundleResult,
  type BundlerPlugin,
  type BundleWarning,
  type BundleWatcher,
  createErrorResult,
  createSuccessResult,
  type InputImport,
  type InputMetadata,
  type LoadArgs,
  type LoadResult,
  type OutputImport,
  type OutputMetadata,
  type PluginBuild,
  type ResolveArgs,
  type ResolveResult,
  type SuccessResultOptions,
  type TransformArgs,
  type TransformResult,
} from "./types.ts";
export {
  type Builder,
  type BuildSnapshot,
  type BuildSnapshotSerialized,
} from "./primitives.ts";

// Snapshot utilities
export {
  AotSnapshot,
  type AotSnapshotState,
  createAotSnapshotState,
  loadAotSnapshot,
} from "./aot-snapshot.ts";

// Manifest types
export {
  addModule,
  createModuleMap,
  getAllChunks,
  getModule,
  hasModule,
  type ModuleEntry,
  type ModuleEntryWithMeta,
  type ModuleMap,
  type ModuleMapWithMeta,
  type SSRModuleEntry,
  type SSRModuleMap,
} from "./module-map.ts";
export {
  addChunk,
  type ChunkInfo,
  type ChunkInfoWithMeta,
  type ChunkManifest,
  type ChunkManifestWithMeta,
  createChunkManifest,
  getAllPaths,
  getChunk,
  getTotalSize,
  hasChunk,
  parseManifest,
  serializeManifest,
} from "./chunk-manifest.ts";

// New bundler backends
export {
  type AdvancedChunksConfig,
  type ChunkGroup,
  createBundler,
  type CreateBundlerOptions,
  createDenoBundlerBackend,
  createRolldownBackend,
  createRolldownWithPreset,
  DenoBundlerBackend,
  type DenoBundlerBackendOptions,
  getDefaultBundler,
  RolldownBackend,
  type RolldownBackendOptions,
  RolldownPresets,
} from "./backends/mod.ts";
