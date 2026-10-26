// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * The chunk manifest: what a client build wrote, and which chunks hold each
 * client component.
 *
 * laroux-bundler writes it, laroux-server injects it into the page as
 * `globalThis.__CHUNK_MANIFEST__`, and the laroux-react client bootstrap reads
 * it to load components. The types live here, in the package all three depend
 * on, so none of them depends on another for the format.
 *
 * @module
 */

import type { LogLevel } from "../config/types.ts";

/**
 * Manifest containing build metadata and chunk mappings for client components
 */
export type ChunkManifest = {
  /** Manifest format version */
  version: string;
  /** Unique build identifier (ULID) */
  buildId: string;
  /** Build timestamp in milliseconds since epoch */
  timestamp: number;
  /** Entry point file name (e.g., "client.js") */
  entrypoint: string;
  /** Log level the build was made with */
  logLevel: LogLevel;
  /** Whether HMR is enabled (true for dev/runtime mode, false for production) */
  hmrEnabled?: boolean;
  /** Map of component paths to their chunk information */
  chunks: Record<string, ComponentChunkInfo>;
  /** Map of generated files and their metadata */
  files: Record<string, FileInfo>;
};

/**
 * Information about a client component and its associated chunks
 */
export type ComponentChunkInfo = {
  /** Main chunk hash (e.g., "MARX6EW4") */
  main: string;
  /** Dependency chunk hashes (e.g., ["N3HWF3I4"]) */
  deps: string[];
  /** Export name - defaults to "default" if omitted */
  exportName?: string;
  /** Total size of chunks in bytes */
  size: number;
};

/**
 * Metadata about a bundled file
 */
export type FileInfo = {
  /** File name */
  name: string;
  /** File size in bytes */
  size: number;
  /** Optional content hash for cache busting */
  hash?: string;
};
