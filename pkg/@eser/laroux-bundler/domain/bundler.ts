// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Common Bundler Interface and Methods
 * Uses @eser/bundler directly for bundling operations.
 *
 * Supports two backends:
 * - "deno-bundler": Native Deno.bundle() API (default)
 * - "rolldown": Rolldown bundler via @eser/bundler (faster, advanced chunking)
 */

import type { ChunkManifest } from "./chunk-manifest.ts";
import type { ClientComponent, ModuleMap } from "./framework-plugin.ts";

import * as logging from "@eser/logging";
import {
  type BundlerConfig,
  type BundleResult as EserBundleResult,
  type BundlerPlugin,
  createBundler,
} from "@eser/bundler/backends";
import type { BundlerBackend } from "../config.ts";

const bundlerLogger = logging.logger.getLogger([
  "laroux-bundler",
  "bundler",
]);

export type BundleOutput = {
  fileName: string;
  size: number;
  code?: string;
  imports?: string[];
};

export type BundleResult = {
  entrypoint: string;
  outputs: Record<string, BundleOutput>;
  manifest: Record<string, string[]>; // component ID → chunk files
  totalSize: number;
};

export type BundleOptions = {
  entrypoints: string[];
  outputDir: string;
  minify?: boolean;
  splitting?: boolean;
  platform?: "browser" | "deno";
  sourcemap?: "external" | "inline" | "none" | boolean;
  /** Bundler plugins for custom resolution and transformation */
  plugins?: BundlerPlugin[];
  /** Global replacements (e.g., process.env.NODE_ENV) */
  define?: Record<string, string>;
};

/**
 * Bundle data returned by bundlers
 */
export type BundleData = {
  /** Client-side JavaScript code */
  clientCode: string | null;
  /** Module map for RSC server rendering */
  moduleMap: ModuleMap;
  /** Chunk manifest for browser */
  chunkManifest: ChunkManifest;
  /** Entry point path */
  entrypoint: string;
};

/**
 * Common bundler interface
 * Both RuntimeBundler and PrebuiltBundler implement this
 */
export interface Bundler {
  /**
   * Get bundle data
   * May trigger rebuild for RuntimeBundler, reads from disk for PrebuiltBundler
   */
  getBundle(): Promise<BundleData>;
}

/**
 * Convert @eser/bundler result to laroux format.
 */
function convertBundleResult(
  result: EserBundleResult,
  componentManifest: Record<string, string[]>,
): BundleResult {
  const outputs: Record<string, BundleOutput> = {};
  let totalSize = 0;

  for (const [name, output] of result.outputs) {
    outputs[name] = {
      fileName: name,
      size: output.size,
    };
    totalSize += output.size;
  }

  return {
    entrypoint: result.entrypoint ?? "client.js",
    outputs,
    manifest: componentManifest,
    totalSize: result.totalSize ?? totalSize,
  };
}

/**
 * Analyze bundle result for statistics
 */
export function analyzeBundleResult(result: BundleResult): {
  chunkCount: number;
  largestChunk: { name: string; size: number };
  smallestChunk: { name: string; size: number };
  averageChunkSize: number;
} {
  const chunks = Object.values(result.outputs);

  if (chunks.length === 0) {
    return {
      chunkCount: 0,
      largestChunk: { name: "", size: 0 },
      smallestChunk: { name: "", size: 0 },
      averageChunkSize: 0,
    };
  }

  const sorted = chunks.sort((a, b) => b.size - a.size);

  const largest = sorted[0];
  const smallest = sorted[sorted.length - 1];

  return {
    chunkCount: chunks.length,
    largestChunk: largest
      ? { name: largest.fileName, size: largest.size }
      : { name: "", size: 0 },
    smallestChunk: smallest
      ? { name: smallest.fileName, size: smallest.size }
      : { name: "", size: 0 },
    averageChunkSize: chunks.length > 0 ? result.totalSize / chunks.length : 0,
  };
}

/**
 * Log bundle statistics using structured logging
 */
export function logBundleStats(result: BundleResult): void {
  const stats = analyzeBundleResult(result);

  bundlerLogger.debug("📊 Bundle Statistics:", {
    totalSizeKB: (result.totalSize / 1024).toFixed(2),
    chunkCount: stats.chunkCount,
    largestChunk: {
      name: stats.largestChunk.name,
      sizeKB: (stats.largestChunk.size / 1024).toFixed(2),
    },
    smallestChunk: {
      name: stats.smallestChunk.name,
      sizeKB: (stats.smallestChunk.size / 1024).toFixed(2),
    },
    averageChunkSizeKB: (stats.averageChunkSize / 1024).toFixed(2),
  });
}

/**
 * Bundle with specified backend.
 *
 * @param options - Bundle options
 * @param clientComponents - Client components to bundle
 * @param backend - Bundler backend
 */
export async function bundle(
  options: BundleOptions,
  clientComponents: ClientComponent[],
  backend: BundlerBackend,
): Promise<BundleResult> {
  bundlerLogger.info(`📦 Using bundler backend: ${backend}`);

  bundlerLogger.debug(`Bundling with @eser/bundler (${backend})...`);
  bundlerLogger.debug(`   Entrypoints: ${options.entrypoints.length}`);
  bundlerLogger.debug(`   Output: ${options.outputDir}`);

  bundlerLogger.debug(`Creating bundler: ${backend}`);

  const bundler = createBundler(backend, { entryName: "client" });

  // Build entrypoints map from array
  const entrypoints: Record<string, string> = {};

  for (let i = 0; i < options.entrypoints.length; i++) {
    const filePath = options.entrypoints[i];
    if (filePath === undefined) continue;
    if (i === 0) {
      entrypoints["client"] = filePath;
    } else {
      const component = clientComponents.find((c) => c.filePath === filePath);
      if (component !== undefined) {
        entrypoints[component.relativePath] = filePath;
      } else {
        entrypoints[`entry-${i}`] = filePath;
      }
    }
  }

  // Convert sourcemap to boolean for @eser/bundler
  const sourcemapEnabled = options.sourcemap === true ||
    options.sourcemap === "external" ||
    options.sourcemap === "inline";

  const config: BundlerConfig = {
    entrypoints,
    outputDir: options.outputDir,
    format: "esm",
    platform: options.platform === "deno" ? "node" : "browser",
    codeSplitting: options.splitting !== false,
    minify: options.minify ?? false,
    sourcemap: sourcemapEnabled,
    plugins: options.plugins,
    define: options.define,
  };

  // Run bundle
  const result = await bundler.bundle(config);

  if (!result.success) {
    const errors = result.errors?.map((e) => e.message).join("\n") ??
      "Unknown error";
    throw new Error(`Bundle failed: ${errors}`);
  }

  // Build component manifest from entrypointManifest
  const manifest: Record<string, string[]> = {};

  for (const component of clientComponents) {
    const chunks = result.entrypointManifest?.[component.filePath] ?? [];
    if (chunks.length > 0) {
      manifest[component.filePath] = [...chunks];
    }
  }

  bundlerLogger.debug(`   Outputs: ${result.outputs.size} files`);
  bundlerLogger.debug(
    `   Total size: ${((result.totalSize ?? 0) / 1024).toFixed(2)} KB`,
  );

  return convertBundleResult(result, manifest);
}

/**
 * Options for bundling server components
 */
export type ServerBundleOptions = {
  /** Server component entry points */
  entrypoints: string[];
  /** Output directory for bundled files */
  outputDir: string;
  /** Project root directory */
  projectRoot: string;
  /** External packages to exclude from bundle (loaded at runtime) */
  externals?: string[];
  /** Bundler plugins for custom resolution and transformation */
  plugins?: BundlerPlugin[];
  /** Enable source maps */
  sourcemap?: boolean;
  /** Enable minification (usually false for server code) */
  minify?: boolean;
};

/**
 * Result of server component bundling
 */
export type ServerBundleResult = {
  /** Map of entry point paths to output paths */
  outputMap: Map<string, string>;
  /** Total bundle size */
  totalSize: number;
  /** Number of files generated */
  fileCount: number;
};

/**
 * Bundle server components with externals.
 *
 * This function bundles server components for SSR/RSC runtime.
 * Key differences from client bundling:
 * - Platform: "node" (server-side)
 * - All npm/jsr packages marked as external (not inlined)
 * - No code splitting (each entry stays separate)
 * - Resolves imports at build time for runtime compatibility
 *
 * @param options - Server bundle options
 * @param backend - Bundler backend to use
 * @returns Server bundle result
 */
export async function bundleServerComponents(
  options: ServerBundleOptions,
  backend: BundlerBackend,
): Promise<ServerBundleResult> {
  bundlerLogger.info(`📦 Bundling server components with ${backend}`);
  bundlerLogger.debug(`   Entrypoints: ${options.entrypoints.length}`);
  bundlerLogger.debug(`   Output: ${options.outputDir}`);
  bundlerLogger.debug(`   Externals: ${options.externals?.length ?? 0}`);

  const bundler = createBundler(backend, { entryName: "server" });

  // Build entrypoints map - each server component is a separate entry
  const entrypoints: Record<string, string> = {};
  for (const filePath of options.entrypoints) {
    // Use relative path from project root as entry name
    const relativePath = filePath.replace(options.projectRoot, "").replace(
      /^\//,
      "",
    );
    // Normalize the entry name (remove src/ prefix if present)
    const entryName = relativePath.replace(/^src\//, "");
    entrypoints[entryName] = filePath;
  }

  const config: BundlerConfig = {
    entrypoints,
    outputDir: options.outputDir,
    format: "esm",
    platform: "node", // Server-side platform
    codeSplitting: false, // Each entry stays separate
    minify: options.minify ?? false,
    sourcemap: options.sourcemap ?? false,
    external: options.externals, // Mark npm/jsr packages as external
    plugins: options.plugins,
  };

  // Run bundle
  const result = await bundler.bundle(config);

  if (!result.success) {
    const errors = result.errors?.map((e) => e.message).join("\n") ??
      "Unknown error";
    throw new Error(`Server bundle failed: ${errors}`);
  }

  // Build output map
  const outputMap = new Map<string, string>();
  for (const [outputPath, output] of result.outputs) {
    if (output.isEntry && result.entrypointManifest !== undefined) {
      // Find the original entry point for this output
      for (
        const [entryPath, chunks] of Object.entries(result.entrypointManifest)
      ) {
        if (chunks.includes(outputPath)) {
          outputMap.set(entryPath, outputPath);
          break;
        }
      }
    }
  }

  bundlerLogger.debug(`   Outputs: ${result.outputs.size} files`);
  bundlerLogger.debug(
    `   Total size: ${((result.totalSize ?? 0) / 1024).toFixed(2)} KB`,
  );

  return {
    outputMap,
    totalSize: result.totalSize ?? 0,
    fileCount: result.outputs.size,
  };
}
