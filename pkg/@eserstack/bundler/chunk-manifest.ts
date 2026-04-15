// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Chunk manifest types for tracking build outputs.
 *
 * The chunk manifest records all output chunks from a build,
 * including their paths, sizes, and content hashes for cache busting.
 *
 * @module
 */

/**
 * Information about a single output chunk.
 */
export interface ChunkInfo {
  /** Output file path relative to build directory. */
  readonly path: string;
  /** File size in bytes. */
  readonly size: number;
  /** Content hash for cache busting (e.g., MD5, SHA-256). */
  readonly hash: string;
}

/**
 * Extended chunk info with additional metadata.
 */
export interface ChunkInfoWithMeta extends ChunkInfo {
  /** Whether this is an entry chunk. */
  readonly isEntry?: boolean;
  /** Whether this chunk is dynamically imported. */
  readonly isDynamic?: boolean;
  /** List of other chunks this chunk depends on. */
  readonly imports?: readonly string[];
  /** MIME type of the chunk content. */
  readonly contentType?: string;
}

/**
 * The complete chunk manifest for a build.
 */
export interface ChunkManifest {
  /** Main entry point chunk name. */
  readonly entrypoint: string;
  /** Map of chunk names to their info. */
  readonly chunks: Readonly<Record<string, ChunkInfo>>;
  /** Unique build identifier. */
  readonly buildId: string;
  /** Build timestamp (Unix milliseconds). */
  readonly timestamp: number;
}

/**
 * Extended chunk manifest with additional build metadata.
 */
export interface ChunkManifestWithMeta extends Omit<ChunkManifest, "chunks"> {
  /** Map of chunk names to their extended info. */
  readonly chunks: Readonly<Record<string, ChunkInfoWithMeta>>;
  /** Build version (e.g., semver or commit hash). */
  readonly version?: string;
  /** Build environment (e.g., "development", "production"). */
  readonly environment?: string;
  /** Total size of all chunks in bytes. */
  readonly totalSize?: number;
}

/**
 * Create an empty chunk manifest.
 */
export const createChunkManifest = (
  entrypoint: string,
  buildId: string,
): ChunkManifest => ({
  entrypoint,
  chunks: {},
  buildId,
  timestamp: Date.now(),
});

/**
 * Add a chunk to the manifest.
 */
export const addChunk = (
  manifest: ChunkManifest,
  name: string,
  info: ChunkInfo,
): ChunkManifest => ({
  ...manifest,
  chunks: {
    ...manifest.chunks,
    [name]: info,
  },
});

/**
 * Get a chunk from the manifest by name.
 */
export const getChunk = (
  manifest: ChunkManifest,
  name: string,
): ChunkInfo | undefined => manifest.chunks[name];

/**
 * Check if a chunk exists in the manifest.
 */
export const hasChunk = (manifest: ChunkManifest, name: string): boolean =>
  name in manifest.chunks;

/**
 * Get the total size of all chunks in bytes.
 */
export const getTotalSize = (manifest: ChunkManifest): number =>
  Object.values(manifest.chunks).reduce((sum, chunk) => sum + chunk.size, 0);

/**
 * Get all chunk paths from the manifest.
 */
export const getAllPaths = (manifest: ChunkManifest): readonly string[] =>
  Object.values(manifest.chunks).map((chunk) => chunk.path);

/**
 * Serialize the manifest to JSON string.
 */
export const serializeManifest = (manifest: ChunkManifest): string =>
  JSON.stringify(manifest, null, 2);

/**
 * Parse a manifest from JSON string.
 */
export const parseManifest = (json: string): ChunkManifest =>
  JSON.parse(json) as ChunkManifest;
