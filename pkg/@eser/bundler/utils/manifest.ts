// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Manifest generation utilities for bundle outputs.
 *
 * Provides utilities for generating:
 * - Module maps (for React Server Components)
 * - Chunk manifests (for build tracking and caching)
 *
 * @module
 */

import type { BundleMetafile, BundleResult } from "../types.ts";
import type {
  ChunkInfo,
  ChunkInfoWithMeta,
  ChunkManifest,
  ChunkManifestWithMeta,
} from "../chunk-manifest.ts";
import type { ModuleEntry, ModuleMap } from "../module-map.ts";

/**
 * Client component info for module map generation.
 */
export interface ClientComponentInfo {
  /** Absolute file path. */
  filePath: string;
  /** Path relative to project root. */
  relativePath: string;
  /** Export names from the component. */
  exportNames: string[];
}

/**
 * Generate a module map from bundle result for React Server Components.
 *
 * The module map is used by react-server-dom-esm to resolve client components
 * from their server-side references to their bundled chunks.
 *
 * @param result - Bundle result with entrypointManifest
 * @param clientComponents - Array of client component info
 * @returns Module map compatible with react-server-dom-esm
 */
export function generateModuleMap(
  result: BundleResult,
  clientComponents: ClientComponentInfo[],
): ModuleMap {
  const modules: Record<string, ModuleEntry> = {};

  for (const component of clientComponents) {
    // Key format: Relative path from project root (e.g., "./src/app/counter.tsx")
    // This must match the $$id that React emits for the component reference
    const key = `./${component.relativePath}`;

    // Get chunks from entrypoint manifest
    const chunks = result.entrypointManifest?.[component.filePath] ?? [];

    // Convert chunk filenames to bundle paths
    const bundleChunks = chunks.length > 0
      ? [...chunks]
      : [component.relativePath.replace(/\.tsx?$/, ".js")];

    modules[key] = {
      id: key,
      name: component.exportNames[0] ?? "default",
      chunks: bundleChunks,
    };
  }

  return modules;
}

/**
 * Generate a module map from bundle result using module IDs.
 *
 * @param result - Bundle result
 * @param moduleIds - Map of module IDs to their names
 * @returns Module map
 */
export function generateModuleMapFromIds(
  result: BundleResult,
  moduleIds: Map<string, string>,
): ModuleMap {
  const modules: Record<string, ModuleEntry> = {};

  for (const [id, name] of moduleIds) {
    // Get chunks from entrypoint manifest if available
    const chunks = result.entrypointManifest?.[id] ?? [];

    modules[id] = {
      id,
      name,
      chunks: [...chunks],
    };
  }

  return modules;
}

/**
 * Generate a chunk manifest from bundle result.
 *
 * @param result - Bundle result
 * @param entrypoint - Main entrypoint name
 * @param buildId - Build identifier
 * @returns Chunk manifest
 */
export function generateChunkManifest(
  result: BundleResult,
  entrypoint: string,
  buildId: string,
): ChunkManifest {
  const chunks: Record<string, ChunkInfo> = {};

  for (const [name, output] of result.outputs) {
    chunks[name] = {
      path: output.path,
      size: output.size,
      hash: output.hash,
    };
  }

  return {
    entrypoint,
    chunks,
    buildId,
    timestamp: Date.now(),
  };
}

/**
 * Generate an extended chunk manifest with metadata.
 *
 * @param result - Bundle result
 * @param entrypoint - Main entrypoint name
 * @param buildId - Build identifier
 * @param options - Additional options
 * @returns Extended chunk manifest
 */
export function generateChunkManifestWithMeta(
  result: BundleResult,
  entrypoint: string,
  buildId: string,
  options?: {
    version?: string;
    environment?: string;
  },
): ChunkManifestWithMeta {
  const chunks: Record<string, ChunkInfoWithMeta> = {};

  let totalSize = 0;

  for (const [name, output] of result.outputs) {
    const metaOutput = result.metafile?.outputs[name];
    const imports = metaOutput?.imports?.map((i) => i.path) ?? [];
    const isEntry = output.isEntry ?? false;
    const isDynamic = !isEntry && !name.startsWith("chunk-");

    chunks[name] = {
      path: output.path,
      size: output.size,
      hash: output.hash,
      isEntry,
      isDynamic,
      imports,
    };

    totalSize += output.size;
  }

  return {
    entrypoint,
    chunks,
    buildId,
    timestamp: Date.now(),
    version: options?.version,
    environment: options?.environment,
    totalSize,
  };
}

/**
 * RSC chunk manifest format for React Server Components.
 * Maps client components to their chunk info with main/deps split.
 */
export interface RSCChunkManifest {
  /** Manifest format version. */
  version: string;
  /** Unique build identifier. */
  buildId: string;
  /** Build timestamp. */
  timestamp: number;
  /** Main entrypoint file. */
  entrypoint: string;
  /** Map of component paths to chunk info. */
  chunks: Record<
    string,
    {
      /** Main chunk identifier (hash). */
      main: string;
      /** Dependency chunk identifiers. */
      deps: string[];
      /** Export name (if not "default"). */
      exportName?: string;
      /** Total size in bytes. */
      size: number;
    }
  >;
  /** Map of all generated files. */
  files: Record<
    string,
    {
      name: string;
      size: number;
      hash?: string;
    }
  >;
}

/**
 * Generate RSC-compatible chunk manifest from bundle result.
 *
 * This format is compatible with react-server-dom-esm's bundler config.
 *
 * @param result - Bundle result with entrypointManifest
 * @param clientComponents - Array of client component info
 * @param buildId - Build identifier
 * @returns RSC chunk manifest
 */
export function generateRSCChunkManifest(
  result: BundleResult,
  clientComponents: ClientComponentInfo[],
  buildId: string,
): RSCChunkManifest {
  const manifest: RSCChunkManifest = {
    version: "1.0",
    buildId,
    timestamp: Date.now(),
    entrypoint: result.entrypoint ?? "main.js",
    chunks: {},
    files: {},
  };

  // Build file info from outputs
  for (const [name, output] of result.outputs) {
    manifest.files[name] = {
      name,
      size: output.size,
      hash: output.hash,
    };
  }

  // Map components to their chunks
  for (const component of clientComponents) {
    const chunks = result.entrypointManifest?.[component.filePath] ?? [];

    if (chunks.length === 0) {
      continue;
    }

    const [mainChunk, ...depChunks] = chunks;

    // Strip chunk decorations: "chunk-ABC123.js" -> "ABC123"
    const stripChunkId = (filename: string): string =>
      filename.replace(/^chunk-/, "").replace(/\.js$/, "");

    const chunkInfo: RSCChunkManifest["chunks"][string] = {
      main: stripChunkId(mainChunk ?? ""),
      deps: depChunks.map(stripChunkId),
      size: chunks.reduce((sum, chunk) => {
        const file = manifest.files[chunk];
        return sum + (file?.size ?? 0);
      }, 0),
    };

    // Only include exportName if not "default"
    const exportName = component.exportNames[0] ?? "default";
    if (exportName !== "default") {
      chunkInfo.exportName = exportName;
    }

    manifest.chunks[component.relativePath] = chunkInfo;
  }

  return manifest;
}

/**
 * Extract dependencies from metafile.
 *
 * @param metafile - Bundle metafile
 * @param outputPath - Output file path
 * @returns List of dependencies
 */
export function extractDependencies(
  metafile: BundleMetafile,
  outputPath: string,
): readonly string[] {
  const output = metafile.outputs[outputPath];
  if (output === undefined) {
    return [];
  }
  return output.imports.map((i) => i.path);
}

/**
 * Get all entry points from bundle result.
 *
 * @param result - Bundle result
 * @returns List of entry point paths
 */
export function getEntryPoints(result: BundleResult): readonly string[] {
  const entries: string[] = [];

  for (const [name, output] of result.outputs) {
    if (output.isEntry) {
      entries.push(name);
    }
  }

  return entries;
}

/**
 * Get all chunk paths from bundle result.
 *
 * @param result - Bundle result
 * @returns List of chunk paths
 */
export function getChunkPaths(result: BundleResult): readonly string[] {
  return Array.from(result.outputs.keys());
}

/**
 * Calculate total bundle size.
 *
 * @param result - Bundle result
 * @returns Total size in bytes
 */
export function getTotalBundleSize(result: BundleResult): number {
  let total = 0;
  for (const output of result.outputs.values()) {
    total += output.size;
  }
  return total;
}
