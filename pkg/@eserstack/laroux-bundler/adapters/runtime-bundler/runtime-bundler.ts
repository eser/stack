// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Runtime Bundler for Dev Mode
 * Performs in-memory transformations without requiring dist/ directory
 *
 * NOTE: This bundler requires a React plugin to function.
 * The RSC functionality is provided by @eserstack/laroux-bundler/adapters/react.
 */

import type {
  ClientComponent,
  FrameworkPlugin,
  ModuleMap,
} from "../../domain/framework-plugin.ts";
import type {
  ChunkManifest,
  ComponentChunkInfo,
  FileInfo,
} from "../../domain/chunk-manifest.ts";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as logging from "@eserstack/logging";
import type { BundleData, Bundler } from "../../domain/bundler.ts";
import { DEVELOPMENT_SETTINGS } from "../../config.ts";
import { type BundlerConfig, createBundler } from "@eserstack/bundler/backends";

const runtimeLogger = logging.logger.getLogger([
  "laroux-bundler",
  "runtime-bundler",
]);

/**
 * Configuration required by runtime bundler
 * Injected as dependency to avoid importing from parent
 */
export type RuntimeBundlerConfig = {
  srcDir: string; // Source directory path
  projectRoot: string; // Project root directory path
  debug?: boolean; // Enable debug logging
  plugin: FrameworkPlugin; // Framework plugin for RSC functionality
};

export type RuntimeBundle = {
  clientCode: string;
  moduleMap: ModuleMap;
  clientComponents: Map<string, ClientComponent>; // filepath -> component info
  chunkManifest: ChunkManifest; // Chunk manifest for browser
};

/**
 * In-memory cache for dev mode
 */
class RuntimeCache {
  private clientComponents: Map<string, ClientComponent> = new Map();
  private moduleMap: ModuleMap | null = null;
  private bundleCode: string | null = null;
  private chunkManifest: ChunkManifest | null = null;
  private lastScan: number = 0;
  private readonly scanInterval = 1000; // Re-scan at most once per second
  private config: RuntimeBundlerConfig;

  async getOrCreateBundle(): Promise<RuntimeBundle> {
    const now = Date.now();

    // Re-scan if cache is stale
    if (now - this.lastScan > this.scanInterval || !this.bundleCode) {
      await this.rebuild();
      this.lastScan = now;
    }

    return {
      clientCode: this.bundleCode!,
      moduleMap: this.moduleMap!,
      clientComponents: this.clientComponents,
      chunkManifest: this.chunkManifest!,
    };
  }

  constructor(config: RuntimeBundlerConfig) {
    this.config = config;
  }

  async rebuild(): Promise<void> {
    const { plugin } = this.config;

    // Step 1: Analyze for "use client" components
    const clientComponentList = plugin.analyzeClientComponents
      ? await plugin.analyzeClientComponents(
        this.config.srcDir,
        this.config.projectRoot,
      )
      : [];

    // Step 2: Store client components in-memory (no transformation needed for dev mode)
    this.clientComponents.clear();
    for (const component of clientComponentList) {
      this.clientComponents.set(component.filePath, component);
    }

    // Step 3: Generate module map using plugin
    this.moduleMap = plugin.createModuleMap
      ? await plugin.createModuleMap(clientComponentList)
      : {};

    // Step 4: Bundle client code in-memory and generate chunk manifest
    const bundleResult = await this.bundleClientCode(clientComponentList);
    this.bundleCode = bundleResult.code;
    this.chunkManifest = bundleResult.manifest;
  }

  private async bundleClientCode(
    clientComponents: ClientComponent[],
  ): Promise<{ code: string; manifest: ChunkManifest }> {
    const { plugin } = this.config;
    const projectRoot = runtime.process.cwd();

    // Create a temporary directory for this bundling process inside project root
    // This allows the bundler to resolve node_modules correctly
    const tempDir = await runtime.fs.makeTempDir({
      prefix: "rsc-runtime-",
      dir: projectRoot, // Create temp dir in project root so node_modules can be found
    });

    try {
      // Generate entry file using plugin
      if (!plugin.createClientEntry) {
        throw new Error("Framework plugin does not provide createClientEntry");
      }
      const generatedEntry = await plugin.createClientEntry(
        clientComponents,
        projectRoot,
        tempDir,
      );

      // Bundle using @eserstack/bundler with deno-bundler backend
      // Create bundler instance - uses same abstraction as prebuilt bundler
      const bundler = createBundler("deno-bundler", { entryName: "client" });

      // Build entrypoints map - BundlerConfig expects Record<string, string>
      const entrypoints: Record<string, string> = {
        client: generatedEntry,
      };
      for (const component of clientComponents) {
        // Use relative path as key for component entrypoints
        entrypoints[component.relativePath] = component.filePath;
      }

      const bundlerConfig: BundlerConfig = {
        entrypoints,
        outputDir: tempDir,
        format: "esm",
        platform: "browser",
        codeSplitting: DEVELOPMENT_SETTINGS.codeSplitting,
        minify: DEVELOPMENT_SETTINGS.minify,
        sourcemap: false,
      };

      const result = await bundler.bundle(bundlerConfig);

      if (!result.success) {
        const errorMsg = result.errors?.map((e) => e.message).join(", ") ??
          "Unknown error";
        throw new Error(`Bundle failed: ${errorMsg}`);
      }

      // Get the main bundle from outputs
      // The deno-bundler backend normalizes the entry name to "client.js"
      const mainOutput = result.outputs.get("client.js");
      if (!mainOutput) {
        throw new Error(
          "Bundle output 'client.js' not found in bundle result",
        );
      }

      // Decode bundle code from Uint8Array
      const bundleCode = new TextDecoder().decode(mainOutput.code);

      // Generate chunk manifest for runtime mode
      // In runtime mode, all components are bundled together
      const chunkManifest: ChunkManifest = {
        version: "1.0",
        buildId: "runtime",
        timestamp: Date.now(),
        logLevel: "debug",
        entrypoint: "__runtime_bundle.js",
        hmrEnabled: true, // HMR is enabled in runtime bundler mode
        chunks: {} as Record<string, ComponentChunkInfo>,
        files: {} as Record<string, FileInfo>,
      };

      // Add each client component to the manifest
      for (const component of clientComponents) {
        const relativePath = component.relativePath;

        chunkManifest.chunks[relativePath] = {
          main: "__runtime_bundle", // All components are in the runtime bundle
          deps: [],
          size: 0, // Size unknown in runtime mode
        };
      }

      return {
        code: bundleCode,
        manifest: chunkManifest,
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      const errorStack = error instanceof Error ? error.stack : null;
      runtimeLogger.error("❌ Runtime bundling failed:");
      runtimeLogger.error(`  Error: ${errorMessage}`);
      if (errorStack !== null) {
        runtimeLogger.error(`  Stack trace:\n${errorStack}`);
      }

      // Fallback: return error code and empty manifest
      // Properly escape for HTML context to prevent XSS
      const escapeHtml = (str: string): string =>
        str
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;")
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r");

      const errorCode = `
console.error("Runtime bundling failed:", ${JSON.stringify(errorMessage)});
document.getElementById("root").innerHTML = '<div class="error"><h2>Bundle Error</h2><pre>${
        escapeHtml(errorMessage)
      }</pre></div>';
`;

      const errorManifest: ChunkManifest = {
        version: "1.0",
        buildId: "runtime-error",
        timestamp: Date.now(),
        logLevel: "error",
        entrypoint: "__runtime_bundle.js",
        hmrEnabled: false,
        chunks: {},
        files: {},
      };

      return {
        code: errorCode,
        manifest: errorManifest,
      };
    } finally {
      // Clean up temporary directory
      try {
        await runtime.fs.remove(tempDir, { recursive: true });
      } catch (cleanupError) {
        // Cleanup failure is non-critical - temp files will be cleaned on next run
        runtimeLogger.debug("Temp directory cleanup failed", {
          error: cleanupError,
        });
      }
    }
  }

  clear(): void {
    this.clientComponents.clear();
    this.moduleMap = null;
    this.bundleCode = null;
    this.lastScan = 0;
  }
}

/**
 * Create a runtime cache instance with injected config
 * Factory function to enable dependency injection
 */
export function createRuntimeCache(config: RuntimeBundlerConfig): RuntimeCache {
  return new RuntimeCache(config);
}

/**
 * Runtime bundler facade with dependency injection
 */
export class RuntimeBundler implements Bundler {
  private cache: RuntimeCache;

  constructor(config: RuntimeBundlerConfig) {
    this.cache = new RuntimeCache(config);
  }

  /**
   * Get runtime bundle (cached, in-memory)
   * Implements Bundler interface
   */
  async getBundle(): Promise<BundleData> {
    const bundle = await this.cache.getOrCreateBundle();

    return {
      clientCode: bundle.clientCode,
      moduleMap: bundle.moduleMap,
      chunkManifest: bundle.chunkManifest,
      entrypoint: "/__runtime_bundle.js", // Runtime bundle endpoint
    };
  }

  /**
   * Get the full runtime bundle data (legacy method for internal use)
   */
  async getRuntimeBundle(): Promise<RuntimeBundle> {
    return await this.cache.getOrCreateBundle();
  }

  /**
   * Force rebuild of runtime bundle
   */
  async rebuild(): Promise<void> {
    await this.cache.rebuild();
  }

  /**
   * Clear runtime cache
   */
  clear(): void {
    this.cache.clear();
  }
}
