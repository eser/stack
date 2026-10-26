// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Prebuilt Bundler
 * Reads pre-built bundles from dist/ directory
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as logging from "@eserstack/logging";
import type { BundleData, Bundler } from "../../domain/bundler.ts";
import type { ChunkManifest } from "../../domain/chunk-manifest.ts";
import type { ModuleMap } from "../../domain/framework-plugin.ts";

const prebuiltLogger = logging.logger.getLogger([
  "laroux-bundler",
  "prebuilt-bundler",
]);

export type PrebuiltBundlerConfig = {
  distDir: string;
};

/**
 * PrebuiltBundler reads from dist/ directory
 * Used when serving pre-built bundles
 */
export class PrebuiltBundler implements Bundler {
  private config: PrebuiltBundlerConfig;
  private cachedManifest: ChunkManifest | null = null;

  constructor(config: PrebuiltBundlerConfig) {
    this.config = config;
  }

  async getBundle(): Promise<BundleData> {
    prebuiltLogger.debug("📦 Loading prebuilt bundle from disk...");

    // Load chunk manifest from client directory
    const manifestPath = runtime.path.resolve(
      this.config.distDir,
      "client",
      "manifest.json",
    );
    const manifestContent = await runtime.fs.readTextFile(manifestPath);
    const chunkManifest: ChunkManifest = JSON.parse(manifestContent);

    // Load module map for SSR (required for client component resolution)
    const moduleMapPath = runtime.path.resolve(
      this.config.distDir,
      "client",
      "module-map.json",
    );
    let moduleMap: ModuleMap = {};
    try {
      const moduleMapContent = await runtime.fs.readTextFile(moduleMapPath);
      moduleMap = JSON.parse(moduleMapContent);
      prebuiltLogger.debug(
        `✅ Loaded module map with ${Object.keys(moduleMap).length} entries`,
      );
    } catch {
      prebuiltLogger.warn(
        "⚠️ Module map not found, SSR may fail for client components",
      );
    }

    // Cache for next time
    this.cachedManifest = chunkManifest;

    // Entrypoint from manifest (served without /dist/client prefix)
    const entrypoint = chunkManifest.entrypoint
      ? `/${chunkManifest.entrypoint}`
      : "/client.js";

    prebuiltLogger.debug(`✅ Loaded manifest with entrypoint: ${entrypoint}`);

    return {
      clientCode: null, // Not needed for prebuilt (served as static file)
      moduleMap,
      chunkManifest,
      entrypoint,
    };
  }

  /**
   * Reload manifest (useful for watch mode)
   */
  async reload(): Promise<void> {
    this.cachedManifest = null;
    await this.getBundle();
  }
}
