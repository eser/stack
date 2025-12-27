// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Deno Bundler backend using native Deno.bundle() API.
 *
 * This backend wraps the Deno.bundle() API (introduced in Deno 2.4.0)
 * with the unified Bundler interface. Requires --unstable-bundle flag.
 *
 * @module
 */

import * as posix from "@std/path/posix";
import { encodeHex } from "@std/encoding/hex";
import { runtime } from "@eser/standards/runtime";
import type {
  BundleError,
  BundleMetafile,
  BundleOutput,
  Bundler,
  BundlerConfig,
  BundleResult,
  BundleWatcher,
  OutputMetadata,
  SuccessResultOptions,
} from "../types.ts";
import { createErrorResult, createSuccessResult } from "../types.ts";

/**
 * Backend options specific to Deno Bundler.
 */
export interface DenoBundlerBackendOptions {
  /** Build ID for cache busting. */
  buildId?: string;
}

/**
 * Deno Bundler backend implementation.
 *
 * Uses the native Deno.bundle() API for bundling.
 * Best for: Native Deno integration, stable fallback.
 */
export class DenoBundlerBackend implements Bundler {
  readonly name = "deno-bundler";
  private readonly options: DenoBundlerBackendOptions;

  constructor(options: DenoBundlerBackendOptions = {}) {
    this.options = options;
  }

  async bundle(config: BundlerConfig): Promise<BundleResult> {
    const tempDir = await runtime.fs.makeTempDir({ prefix: "deno-bundle-" });

    try {
      const entrypointPaths = Object.values(config.entrypoints);

      // Create build ID entry if provided
      const allEntrypoints = [...entrypointPaths];
      if (this.options.buildId !== undefined) {
        const buildIdEntryPath = posix.join(tempDir, "_build-id-entry.ts");
        await runtime.fs.writeTextFile(
          buildIdEntryPath,
          `export const BUILD_ID = "${this.options.buildId}";\n`,
        );
        allEntrypoints.unshift(buildIdEntryPath);
      }

      // Deno.bundle only supports "browser" platform
      const platform = config.platform === "browser" ? "browser" : "browser";

      const result = await Deno.bundle({
        entrypoints: allEntrypoints,
        outputDir: tempDir,
        format: "esm",
        codeSplitting: config.codeSplitting,
        minify: config.minify,
        platform,
      });

      if (!result.success) {
        const diagnostics = (result as unknown as { diagnostics?: unknown[] })
          .diagnostics ?? [];
        const errors: BundleError[] = diagnostics.map((e: unknown) => ({
          message: this.extractErrorMessage(e),
          severity: "error" as const,
        }));
        return createErrorResult(errors);
      }

      return await this.processOutput(tempDir, config);
    } catch (error) {
      return createErrorResult([{
        message: error instanceof Error ? error.message : String(error),
        severity: "fatal",
      }]);
    } finally {
      try {
        await runtime.fs.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  watch(
    config: BundlerConfig,
    onChange: (result: BundleResult) => void,
  ): Promise<BundleWatcher> {
    let running = true;
    const watchPaths = Object.values(config.entrypoints).map((p) =>
      posix.dirname(p)
    );
    const uniquePaths = [...new Set(watchPaths)];

    // Use Deno.watchFs directly for file watching
    const watcher = Deno.watchFs(uniquePaths, { recursive: true });

    const watchLoop = async () => {
      for await (const _event of watcher) {
        if (!running) break;
        const result = await this.bundle(config);
        onChange(result);
      }
    };

    watchLoop().catch(() => {});

    return Promise.resolve({
      stop: () => {
        running = false;
        watcher.close();
        return Promise.resolve();
      },
    });
  }

  private extractErrorMessage(error: unknown): string {
    if (error === null || error === undefined) return "Unknown error";
    if (typeof error === "object" && "message" in error) {
      return String((error as { message: unknown }).message);
    }
    return String(error);
  }

  private async processOutput(
    outputDir: string,
    config: BundlerConfig,
  ): Promise<BundleResult> {
    const outputs = new Map<string, BundleOutput>();
    const metaOutputs: Record<string, OutputMetadata> = {};
    const entrypointManifest: Record<string, string[]> = {};
    let mainEntrypoint = "";
    let totalSize = 0;

    // Deno.bundle() creates a nested dist/ directory
    const nestedDistDir = posix.join(outputDir, "dist");
    let scanDir = outputDir;

    try {
      const nestedStat = await runtime.fs.stat(nestedDistDir);
      if (nestedStat.isDirectory) {
        scanDir = nestedDistDir;
      }
    } catch {
      // No nested dir, use outputDir
    }

    // Collect all output files
    const outputFiles: Array<{ name: string; path: string }> = [];

    for await (const entry of runtime.fs.readDir(scanDir)) {
      if (entry.isFile && entry.name.endsWith(".js")) {
        outputFiles.push({
          name: entry.name,
          path: posix.join(scanDir, entry.name),
        });
      }
    }

    // Also check root outputDir for chunk files if we scanned nested
    if (scanDir !== outputDir) {
      for await (const entry of runtime.fs.readDir(outputDir)) {
        if (
          entry.isFile &&
          entry.name.endsWith(".js") &&
          entry.name.startsWith("chunk-")
        ) {
          const path = posix.join(outputDir, entry.name);
          if (!outputFiles.some((f) => f.path === path)) {
            outputFiles.push({ name: entry.name, path });
          }
        }
      }
    }

    // Map to track original entrypoint paths to their generated proxy files
    const entrypointPaths = Object.values(config.entrypoints);

    // Process each output file
    for (const file of outputFiles) {
      let content = await runtime.fs.readTextFile(file.path);

      // Post-process: Replace URL paths
      if (config.basePath !== undefined) {
        content = content.replace(
          /\/_lime\/alive/g,
          `${config.basePath}/_lime/alive`,
        );
      }

      // Fix relative import paths (Deno.bundle quirk)
      content = content.replace(/from\s*["']\.\.\/chunk-/g, 'from"./chunk-');
      content = content.replace(/from\s*["']\.\.chunk-/g, 'from"./chunk-');
      content = content.replace(
        /import\s*\(["']\.\.\/chunk-/g,
        'import("./chunk-',
      );
      content = content.replace(
        /import\s*\(["']\.\.chunk-/g,
        'import("./chunk-',
      );

      // Normalize file name
      let normalizedName = file.name;
      const isMainEntry = normalizedName.startsWith("_client-entry");
      if (isMainEntry) {
        normalizedName = "main.js";
        mainEntrypoint = "main.js";
      } else if (normalizedName.startsWith("_build-id-entry")) {
        normalizedName = "build-id.js";
      }

      const encoded = new TextEncoder().encode(content);
      const hash = await this.computeHash(encoded);
      const imports = this.parseImports(content);

      outputs.set(normalizedName, {
        path: normalizedName,
        code: encoded,
        size: encoded.length,
        hash,
        isEntry: !normalizedName.startsWith("chunk-"),
      });

      totalSize += encoded.length;

      metaOutputs[normalizedName] = {
        bytes: encoded.length,
        inputs: {},
        imports: imports.map((path) => ({
          path,
          kind: "import-statement" as const,
        })),
      };
    }

    // Build entrypoint manifest by analyzing proxy files
    // Proxy files are generated by Deno.bundle for each entrypoint
    for (let i = 0; i < entrypointPaths.length; i++) {
      const entrypointPath = entrypointPaths[i];
      if (entrypointPath === undefined) continue;

      // Find the corresponding proxy file for this entrypoint
      const chunks = await this.findEntrypointChunks(
        entrypointPath,
        scanDir,
        outputDir,
        outputs,
      );

      if (chunks.length > 0) {
        entrypointManifest[entrypointPath] = chunks;
      }
    }

    const metafile: BundleMetafile = {
      inputs: {},
      outputs: metaOutputs,
    };

    const options: SuccessResultOptions = {
      metafile,
      entrypointManifest,
      entrypoint: mainEntrypoint || "main.js",
      totalSize,
    };

    return createSuccessResult(outputs, options);
  }

  /**
   * Find which chunks an entrypoint depends on by analyzing proxy files.
   */
  private async findEntrypointChunks(
    entrypointPath: string,
    scanDir: string,
    outputDir: string,
    outputs: Map<string, BundleOutput>,
  ): Promise<string[]> {
    // Convert entrypoint path to expected proxy file path
    // e.g., "/path/to/counter.tsx" -> proxy file at "path/to/counter.js"
    const relativePath = entrypointPath.replace(/\.tsx?$/, ".js");
    const proxyFilePath = posix.join(scanDir, relativePath);

    try {
      const content = await runtime.fs.readTextFile(proxyFilePath);
      return this.extractChunksFromProxyFile(content, outputs);
    } catch {
      // Try in the nested directory structure
      try {
        const nestedProxyPath = posix.join(outputDir, "dist", relativePath);
        const content = await runtime.fs.readTextFile(nestedProxyPath);
        return this.extractChunksFromProxyFile(content, outputs);
      } catch {
        // No proxy file found - this might be the main entry
        return [];
      }
    }
  }

  /**
   * Extract chunk dependencies from a proxy file's import statements.
   */
  private extractChunksFromProxyFile(
    content: string,
    _outputs: Map<string, BundleOutput>,
  ): string[] {
    const chunks: string[] = [];

    // Pattern: import{...}from"../../chunk-HASH.js" or import"../../chunk-HASH.js"
    const chunkImportPattern =
      /import(?:\{[^}]*\})?\s*from\s*["']([^"']*chunk-[A-Z0-9]+\.js)["']/gi;
    const sideEffectPattern = /import\s*["']([^"']*chunk-[A-Z0-9]+\.js)["']/gi;

    let match: RegExpExecArray | null;

    // Find all chunk imports
    while ((match = chunkImportPattern.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath !== undefined) {
        const chunkFile = posix.basename(importPath);
        if (!chunks.includes(chunkFile)) {
          chunks.push(chunkFile);
        }
      }
    }

    // Find side-effect imports
    while ((match = sideEffectPattern.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath !== undefined) {
        const chunkFile = posix.basename(importPath);
        if (!chunks.includes(chunkFile)) {
          chunks.push(chunkFile);
        }
      }
    }

    // Determine main chunk (the one that exports the component)
    const exportMatch = content.match(/export\s*\{([^}]+)\}/);
    if (exportMatch !== null && chunks.length > 0) {
      const exportStatement = exportMatch[1];
      const symbolMatch = exportStatement?.match(/(\w+)\s+as\s+/);
      const exportedSymbol = symbolMatch !== null && symbolMatch !== undefined
        ? symbolMatch[1]
        : null;

      if (exportedSymbol !== null) {
        // Find which chunk exports this symbol
        for (const chunkFile of chunks) {
          const chunkName = chunkFile.replace(/\.js$/, "");
          const importPattern = new RegExp(
            `import\\s*\\{[^}]*\\b${exportedSymbol}\\b[^}]*\\}\\s*from\\s*["'][^"']*${chunkName}`,
          );
          if (importPattern.test(content)) {
            // Move main chunk to front
            const mainIndex = chunks.indexOf(chunkFile);
            if (mainIndex > 0) {
              chunks.splice(mainIndex, 1);
              chunks.unshift(chunkFile);
            }
            break;
          }
        }
      }
    }

    return chunks;
  }

  private async computeHash(content: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      content as BufferSource,
    );
    return encodeHex(new Uint8Array(hashBuffer)).slice(0, 16);
  }

  private parseImports(content: string): string[] {
    const imports: string[] = [];

    // Match static imports: import ... from "..."
    const staticImportRegex = /import\s+(?:[^;]+)\s+from\s*["']([^"']+)["']/g;
    let match: RegExpExecArray | null;

    while ((match = staticImportRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (
        importPath !== undefined &&
        (importPath.startsWith("./") ||
          importPath.startsWith("../") ||
          importPath.startsWith("/"))
      ) {
        const normalized = importPath.startsWith("./")
          ? importPath.slice(2)
          : importPath.startsWith("../")
          ? importPath
          : importPath.slice(1);
        imports.push(normalized);
      }
    }

    // Match dynamic imports: import("...")
    const dynamicImportRegex = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (
        importPath !== undefined &&
        (importPath.startsWith("./") ||
          importPath.startsWith("../") ||
          importPath.startsWith("/"))
      ) {
        const normalized = importPath.startsWith("./")
          ? importPath.slice(2)
          : importPath.startsWith("../")
          ? importPath
          : importPath.slice(1);
        imports.push(normalized);
      }
    }

    return [...new Set(imports)];
  }
}

/**
 * Create a Deno Bundler backend instance.
 */
export const createDenoBundlerBackend = (
  options: DenoBundlerBackendOptions = {},
): DenoBundlerBackend => new DenoBundlerBackend(options);
