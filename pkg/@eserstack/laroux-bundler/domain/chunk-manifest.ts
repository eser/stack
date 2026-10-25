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
import type {
  ChunkManifest,
  ComponentChunkInfo,
  FileInfo,
} from "@eserstack/laroux";
import type { LogLevel } from "@eserstack/laroux/config";
import * as virtualSource from "./virtual-source.ts";
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
 * The bundle outputs do not cover the client components: a component has no
 * chunk mapping, or its mapping names a chunk the bundle did not emit.
 */
export class ChunkManifestError extends Error {
  /** One entry per component or chunk that could not be resolved */
  readonly problems: readonly string[];
  /** What the bundle did produce: output files or mapped entry points */
  readonly available: readonly string[];

  // Explicit assignment, not parameter properties: Node's erase-only type
  // stripping cannot emit the assignment a parameter property implies.
  constructor(
    message: string,
    problems: readonly string[],
    available: readonly string[],
  ) {
    super(message);
    this.name = "ChunkManifestError";
    this.problems = problems;
    this.available = available;
  }
}

// The format is shared with laroux-server and the laroux-react client
// bootstrap, so it lives in @eserstack/laroux; it is re-exported here for
// callers that import it from the bundler.
export type { ChunkManifest, ComponentChunkInfo, FileInfo };

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

  // Fail the build if validation found issues; the build logs the error
  if (missingChunks.length > 0) {
    const availableFiles = Object.keys(manifest.files);
    throw new ChunkManifestError(
      `chunk manifest: ${missingChunks.length} chunk(s) referenced but not found in bundle outputs: ${
        missingChunks.join("; ")
      }. Bundle outputs: ${availableFiles.join(", ")}`,
      missingChunks,
      availableFiles,
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
 * 2. This contains the actual chunk files the bundler generated
 * 3. Throws error if manifest mapping is missing (fail-fast)
 */
function findChunksForComponent(
  component: ClientComponent,
  bundleResult: BundleResult,
): string[] {
  // Check if bundleResult has manifest mapping for this component
  const manifestChunks = bundleResult.manifest[component.filePath];

  if (manifestChunks === undefined || manifestChunks.length === 0) {
    // The bundler did not map this component to any chunk, which a working
    // bundler never does; the build logs the error
    const availableMappings = Object.keys(bundleResult.manifest);
    throw new ChunkManifestError(
      `chunk manifest: no chunks found for ${component.relativePath} (${component.filePath}); ` +
        `the bundler did not analyze the component's dependencies. Mapped entry points: ${
          availableMappings.join(", ")
        }`,
      [component.filePath],
      availableMappings,
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
  const prefix = `${virtualSource.VIRTUAL_SRC_DIR}/`;
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
