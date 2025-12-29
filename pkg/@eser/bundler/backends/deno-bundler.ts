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
  /** Custom entry point name (default: "main"). */
  entryName?: string;
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

      // Convert sourcemap config to Deno.bundle format
      // Deno.bundle accepts "external" | "inline" | undefined
      const sourcemapValue = config.sourcemap === true
        ? "external"
        : config.sourcemap === false
        ? undefined
        : config.sourcemap;

      const result = await Deno.bundle({
        entrypoints: allEntrypoints,
        outputDir: tempDir,
        format: "esm",
        codeSplitting: config.codeSplitting,
        minify: config.minify,
        platform,
        sourcemap: sourcemapValue,
        ...(config.external !== undefined && config.external.length > 0
          ? { external: [...config.external] }
          : {}),
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
    tempDir: string,
    config: BundlerConfig,
  ): Promise<BundleResult> {
    const entryName = this.options.entryName ?? "main";
    const outputs = new Map<string, BundleOutput>();
    const metaOutputs: Record<string, OutputMetadata> = {};
    const entrypointManifest: Record<string, string[]> = {};
    let mainEntrypoint = "";
    let totalSize = 0;

    // Deno.bundle() creates a nested dist/ directory
    const nestedDistDir = posix.join(tempDir, "dist");
    let scanDir = tempDir;

    try {
      const nestedStat = await runtime.fs.stat(nestedDistDir);
      if (nestedStat.isDirectory) {
        scanDir = nestedDistDir;
      }
    } catch {
      // No nested dir, use outputDir
    }

    // Collect all output files (both .js and .map files)
    const outputFiles: Array<{ name: string; path: string }> = [];

    for await (const entry of runtime.fs.readDir(scanDir)) {
      if (
        entry.isFile &&
        (entry.name.endsWith(".js") || entry.name.endsWith(".map"))
      ) {
        outputFiles.push({
          name: entry.name,
          path: posix.join(scanDir, entry.name),
        });
      }
    }

    // Also check root tempDir for chunk files if we scanned nested
    if (scanDir !== tempDir) {
      for await (const entry of runtime.fs.readDir(tempDir)) {
        if (
          entry.isFile &&
          (entry.name.endsWith(".js") || entry.name.endsWith(".map")) &&
          (entry.name.startsWith("chunk-") || entry.name.endsWith(".map"))
        ) {
          const path = posix.join(tempDir, entry.name);
          if (!outputFiles.some((f) => f.path === path)) {
            outputFiles.push({ name: entry.name, path });
          }
        }
      }
    }

    // Track source map content to attach to JS outputs
    const sourceMaps = new Map<string, Uint8Array>();

    // First pass: collect source maps
    for (const file of outputFiles) {
      if (file.name.endsWith(".map")) {
        const mapContent = await runtime.fs.readFile(file.path);
        // Normalize the map file name to match JS file naming
        let normalizedMapName = file.name;
        if (file.name.startsWith("_client-entry")) {
          normalizedMapName = `${entryName}.js.map`;
        } else if (file.name.startsWith("_build-id-entry")) {
          normalizedMapName = "build-id.js.map";
        }
        sourceMaps.set(normalizedMapName, mapContent);
      }
    }

    // Second pass: process JS files
    for (const file of outputFiles) {
      if (file.name.endsWith(".map")) continue; // Skip maps, already processed

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
        normalizedName = `${entryName}.js`;
        mainEntrypoint = `${entryName}.js`;
      } else if (normalizedName.startsWith("_build-id-entry")) {
        normalizedName = "build-id.js";
      }

      // Add or update sourcemap reference for entry files
      if (isMainEntry && sourceMaps.has(`${entryName}.js.map`)) {
        content = content.replace(
          /\/\/# sourceMappingURL=.*$/m,
          `//# sourceMappingURL=${entryName}.js.map`,
        );
        if (!content.includes("//# sourceMappingURL=")) {
          content += `\n//# sourceMappingURL=${entryName}.js.map`;
        }
      }

      const encoded = new TextEncoder().encode(content);
      const hash = await this.computeHash(encoded);
      const imports = this.parseImports(content);

      // Get associated source map
      const mapFileName = `${normalizedName}.map`;
      const mapContent = sourceMaps.get(mapFileName);

      outputs.set(normalizedName, {
        path: normalizedName,
        code: encoded,
        map: mapContent,
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

    // Also add standalone source map files to outputs (for external sourcemaps)
    for (const [mapName, mapContent] of sourceMaps) {
      if (!outputs.has(mapName)) {
        const hash = await this.computeHash(mapContent);
        outputs.set(mapName, {
          path: mapName,
          code: mapContent,
          size: mapContent.length,
          hash,
          isEntry: false,
        });
        totalSize += mapContent.length;
      }
    }

    // Write outputs to final output directory if specified
    if (config.outputDir !== undefined) {
      await runtime.fs.mkdir(config.outputDir, { recursive: true });
      for (const [fileName, output] of outputs) {
        const outputPath = posix.join(config.outputDir, fileName);
        await runtime.fs.writeFile(outputPath, output.code);
      }
    }

    // Build entrypoint manifest by analyzing proxy files
    // Proxy files are generated by Deno.bundle for each entrypoint
    // Use entrypoint keys (relative paths) to find proxy files, and values (full paths) for manifest keys
    for (const [entryKey, entryValue] of Object.entries(config.entrypoints)) {
      // Skip main entry - it doesn't have a proxy file
      if (entryKey === "client" || entryKey === "main") continue;

      // Find the corresponding proxy file for this entrypoint
      // entryKey is the relative path like "src/app/counter.tsx"
      const chunks = await this.findEntrypointChunks(
        entryKey,
        scanDir,
        tempDir,
        outputs,
      );

      if (chunks.length > 0) {
        // Use the full path (entryValue) as the manifest key for compatibility
        entrypointManifest[entryValue] = chunks;
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
    // e.g., "src/app/counter.tsx" -> proxy file at "src/app/counter.js"
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
