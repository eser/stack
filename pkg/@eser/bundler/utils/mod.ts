// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Bundler utilities.
 *
 * @module
 */

export {
  computeCombinedHash,
  computeHash,
  computeStringHash,
  type HashAlgorithm,
} from "./hash.ts";

export {
  type ClientComponentInfo,
  extractDependencies,
  generateChunkManifest,
  generateChunkManifestWithMeta,
  generateModuleMap,
  generateModuleMapFromIds,
  generateRSCChunkManifest,
  getChunkPaths,
  getEntryPoints,
  getTotalBundleSize,
  type RSCChunkManifest,
} from "./manifest.ts";
