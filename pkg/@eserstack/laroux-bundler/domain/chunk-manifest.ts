// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Chunk Manifest Generator
 * Maps client components to their bundle chunks
 *
 * Uses @eserstack/bundler for base chunk manifest types.
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import type {
  ChunkInfo as BaseChunkInfo,
  ChunkManifest as BaseChunkManifest,
} from "@eserstack/bundler";
import type { BundleResult } from "./bundler.ts";
import type { ClientComponent } from "./framework-plugin.ts";
import type { LogLevel } from "@eserstack/laroux/config";
import { VIRTUAL_SRC_DIR } from "./virtual-source.ts";
import * as logging from "@eserstack/logging";

const manifestLogger = logging.logger.getLogger([
  "laroux-bundler",
  "chunk-manifest",
]);

// Re-export base types for reference
export type { BaseChunkInfo, BaseChunkManifest };

// Constants
const MANIFEST_VERSION = "1.0";

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
  /** Log level for LogTape */
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

/**
 * Generate chunk manifest from bundle result and component analysis
 */
export function generateChunkManifest(
  buildId: string,
  timestamp: number,
  bundleResult: BundleResult,
  components: ClientComponent[],
  logLevel: LogLevel = "info",
  hmrEnabled: boolean = false,
): ChunkManifest {
  manifestLogger.debug(`📋 Generating chunk manifest...`);

  const manifest: ChunkManifest = {
    version: MANIFEST_VERSION,
    buildId,
    timestamp,
    entrypoint: bundleResult.entrypoint,
    logLevel,
    hmrEnabled,
    chunks: {},
    files: {},
  };

  // Build file info from bundle outputs
  for (const [_path, output] of Object.entries(bundleResult.outputs)) {
    manifest.files[output.fileName] = {
      name: output.fileName,
      size: output.size,
      hash: extractHash(output.fileName) ?? undefined,
    };
  }

  // Map each component to its chunks using ES Module specifiers
  const missingChunks: string[] = [];

  for (const component of components) {
    const chunks = findChunksForComponent(component, bundleResult);

    // First chunk is the main chunk, rest are dependencies
    const [mainChunk, ...depChunks] = chunks;

    if (!mainChunk) {
      manifestLogger.warn(`No chunks found for ${component.relativePath}`);
      continue;
    }

    // Validate that all referenced chunks exist in the bundle outputs
    const allChunks = [mainChunk, ...depChunks];
    for (const chunkFile of allChunks) {
      if (!manifest.files[chunkFile]) {
        missingChunks.push(
          `${component.relativePath} references ${chunkFile}, but it's not in bundle outputs`,
        );
      }
    }

    // Normalize the key to match module-map format (strip _bundle_src/ prefix)
    const manifestKey = normalizeManifestKey(component.relativePath);

    manifest.chunks[manifestKey] = {
      main: stripChunkDecorations(mainChunk),
      deps: depChunks.map(stripChunkDecorations),
      size: calculateTotalSize(chunks, manifest.files),
    };

    // Only include exportName if it's not "default" (byte optimization)
    const exportName = component.exportNames[0] ?? "default";
    if (exportName !== "default") {
      manifest.chunks[manifestKey].exportName = exportName;
    }

    manifestLogger.debug(
      `   ${manifestKey} → main: ${mainChunk}, deps: [${depChunks.join(", ")}]`,
    );
  }

  // Fail build if validation found issues
  if (missingChunks.length > 0) {
    manifestLogger.error(`❌ Chunk manifest validation failed!`);
    manifestLogger.error(`   Missing chunks:`);
    for (const missing of missingChunks) {
      manifestLogger.error(`   - ${missing}`);
    }
    manifestLogger.error(
      `   Available files: ${Object.keys(manifest.files).join(", ")}`,
    );
    throw new Error(
      `Chunk manifest validation failed: ${missingChunks.length} chunk(s) referenced but not found in bundle outputs`,
    );
  }

  manifestLogger.debug(`✅ Manifest generated`);
  manifestLogger.debug(`   Components: ${Object.keys(manifest.chunks).length}`);
  manifestLogger.debug(`   Chunks: ${Object.keys(manifest.files).length}`);
  manifestLogger.debug(`   Validation: All referenced chunks exist`);

  return manifest;
}

/**
 * Find which chunks contain a specific component
 *
 * Strategy (Code Splitting Mode):
 * 1. Use the bundleResult.manifest mapping (required)
 * 2. This contains the actual chunk files generated by Deno.bundle()
 * 3. Throws error if manifest mapping is missing (fail-fast)
 */
function findChunksForComponent(
  component: ClientComponent,
  bundleResult: BundleResult,
): string[] {
  // Check if bundleResult has manifest mapping for this component
  const manifestChunks = bundleResult.manifest[component.filePath];

  if (!manifestChunks || manifestChunks.length === 0) {
    // Build failed: chunk mapping is incomplete
    // This should never happen in a properly functioning bundler
    manifestLogger.error(
      `❌ No chunk mapping found for component: ${component.filePath}`,
    );
    manifestLogger.error(
      `   Available mappings: ${Object.keys(bundleResult.manifest).join(", ")}`,
    );
    throw new Error(
      `Chunk manifest incomplete: No chunks found for ${component.relativePath}. ` +
        `This indicates the bundler failed to analyze the component's dependencies.`,
    );
  }

  return manifestChunks;
}

/**
 * Calculate total size of chunks
 */
function calculateTotalSize(
  chunkNames: string[],
  files: Record<string, FileInfo>,
): number {
  return chunkNames.reduce((total, chunkName) => {
    const file = files[chunkName];
    return total + (file?.size ?? 0);
  }, 0);
}

/**
 * Extract hash from filename
 * e.g., "Counter-abc123.js" → "abc123"
 */
function extractHash(fileName: string): string | null {
  const match = fileName.match(/-([a-f0-9]+)\./i);
  return match?.[1] ?? null;
}

/**
 * Strip chunk decorations from filename
 * e.g., "chunk-MARX6EW4.js" → "MARX6EW4"
 */
function stripChunkDecorations(filename: string): string {
  return filename.replace(/^chunk-/, "").replace(/\.js$/, "");
}

/**
 * Normalize component path for manifest key
 * Strips the _bundle_src/ prefix that's added during virtual source bundling
 * e.g., "_bundle_src/src/app/icon.tsx" → "src/app/icon.tsx"
 */
function normalizeManifestKey(relativePath: string): string {
  const prefix = `${VIRTUAL_SRC_DIR}/`;
  if (relativePath.startsWith(prefix)) {
    return relativePath.slice(prefix.length);
  }
  return relativePath;
}

/**
 * Save manifest to file
 */
export async function saveChunkManifest(
  manifest: ChunkManifest,
  outputPath: string,
): Promise<void> {
  await runtime.fs.writeTextFile(
    outputPath,
    JSON.stringify(manifest, null, 2),
  );
  manifestLogger.debug(`📝 Chunk manifest saved: ${outputPath}`);
}

/**
 * Load manifest from file
 */
export async function loadChunkManifest(
  filePath: string,
): Promise<ChunkManifest> {
  const content = await runtime.fs.readTextFile(filePath);
  return JSON.parse(content);
}

/**
 * Log manifest using structured logging
 */
export function logManifest(manifest: ChunkManifest): void {
  manifestLogger.debug("📦 Chunk Manifest:", {
    entrypoint: manifest.entrypoint,
    components: Object.keys(manifest.chunks).length,
    files: Object.keys(manifest.files).length,
    chunks: Object.fromEntries(
      Object.entries(manifest.chunks).map(([id, info]) => [
        id,
        {
          main: info.main,
          deps: info.deps,
          exportName: info.exportName,
          sizeKB: (info.size / 1024).toFixed(2),
        },
      ]),
    ),
  });
}
