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
import * as hex from "@std/encoding/hex";
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
    let mainEntrypoint = null;
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
      entrypoint: mainEntrypoint ?? "main.js",
      totalSize,
    };

    return createSuccessResult(outputs, options);
  }

  /**
   * Find which chunks an entrypoint depends on by analyzing proxy files.
   * Also searches all chunks to find where the component is actually exported.
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

    // Try to read proxy file
    let proxyContent: string | null = null;
    try {
      proxyContent = await runtime.fs.readTextFile(proxyFilePath);
    } catch {
      // Try in the nested directory structure
      try {
        const nestedProxyPath = posix.join(outputDir, "dist", relativePath);
        proxyContent = await runtime.fs.readTextFile(nestedProxyPath);
      } catch {
        // No proxy file found
      }
    }

    // If we have a proxy file, use it
    if (proxyContent !== null) {
      return this.extractChunksFromProxyFile(proxyContent, outputs);
    }

    // No proxy file - search all chunks for the component export
    // This handles cases where Deno.bundle doesn't create proxy files
    return this.findChunksForComponentName(entrypointPath, outputs);
  }

  /**
   * Find chunks containing a component by searching all chunk exports.
   * Used when no proxy file exists for an entrypoint.
   */
  private findChunksForComponentName(
    entrypointPath: string,
    outputs: Map<string, BundleOutput>,
  ): string[] {
    const chunks: string[] = [];

    // Extract expected export name from file path
    // e.g., "src/app/icon.tsx" -> "Icon" (PascalCase of basename)
    const basename = posix.basename(entrypointPath).replace(/\.[^.]+$/, "");
    const expectedExport = basename.charAt(0).toUpperCase() +
      basename.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    // Search all chunks for the exported component
    for (const [chunkFile, chunkOutput] of outputs) {
      // Only check chunk files
      if (!chunkFile.startsWith("chunk-") || !chunkFile.endsWith(".js")) {
        continue;
      }

      const chunkContent = new TextDecoder().decode(chunkOutput.code);

      // Check if this chunk exports the expected symbol
      const exportPatterns = [
        // export { Symbol } or export { Symbol, ... } or export { X as Symbol }
        new RegExp(`export\\s*\\{[^}]*\\b${expectedExport}\\b[^}]*\\}`),
        // export function Symbol or export const Symbol
        new RegExp(
          `export\\s+(?:function|const|let|var|class)\\s+${expectedExport}\\b`,
        ),
        // minified pattern: Symbol2 as Symbol
        new RegExp(`\\b\\w+\\s+as\\s+${expectedExport}\\b`),
      ];

      const exportsSymbol = exportPatterns.some((pattern) =>
        pattern.test(chunkContent)
      );

      if (exportsSymbol) {
        // Found the main chunk - add it to the front
        chunks.unshift(chunkFile);

        // Also find dependency chunks by looking at what this chunk imports
        const importPattern =
          /from\s*["']\.?\/?([^"']*chunk-[A-Z0-9]+\.js)["']/gi;
        let match: RegExpExecArray | null;
        while ((match = importPattern.exec(chunkContent)) !== null) {
          const depChunk = posix.basename(match[1] ?? "");
          if (depChunk && !chunks.includes(depChunk)) {
            chunks.push(depChunk);
          }
        }
        break;
      }
    }

    return chunks;
  }

  /**
   * Extract chunk dependencies from a proxy file's import statements.
   * Returns chunks with the main chunk (containing the exported symbol) first.
   *
   * IMPORTANT: Due to code splitting, the proxy file may not import from the chunk
   * that actually contains the exported component. We must search ALL chunks to find
   * the one that exports the symbol.
   */
  private extractChunksFromProxyFile(
    content: string,
    outputs: Map<string, BundleOutput>,
  ): string[] {
    const chunks: string[] = [];

    // Pattern: import{...}from"../../chunk-HASH.js" or import"../../chunk-HASH.js"
    // Use specific character classes to prevent ReDoS (avoid unbounded [^X]* patterns)
    const chunkImportPattern =
      /import(?:\{[\w\s,]*\})?\s*from\s*["']([\w./-]*chunk-[A-Z0-9]+\.js)["']/gi;
    const sideEffectPattern =
      /import\s*["']([\w./-]*chunk-[A-Z0-9]+\.js)["']/gi;

    let match: RegExpExecArray | null;

    // Find all chunk imports from proxy file
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

    // Determine main chunk by finding which chunk actually exports the symbol
    // IMPORTANT: Search ALL chunks in the bundle, not just the ones imported by proxy
    // Use specific character class to prevent ReDoS
    const exportMatch = content.match(/export\s*\{([\w\s,]+)\}/);
    if (exportMatch !== null) {
      const exportStatement = exportMatch[1];
      // Match either "Symbol as ExportName" or just "Symbol"
      const symbolMatch = exportStatement?.match(/(\w+)(?:\s+as\s+\w+)?/);
      const exportedSymbol = symbolMatch?.[1] ?? null;

      if (exportedSymbol !== null) {
        // Search ALL chunks in the bundle to find which one exports the symbol
        // This handles code splitting where the actual component ends up in a shared chunk
        let mainChunkFile: string | null = null;

        for (const [chunkFile, chunkOutput] of outputs) {
          // Only check chunk files (not main entry or other files)
          if (!chunkFile.startsWith("chunk-") || !chunkFile.endsWith(".js")) {
            continue;
          }

          const chunkContent = new TextDecoder().decode(chunkOutput.code);

          // Check if this chunk exports the symbol directly
          const exportPatterns = [
            // export { Symbol } or export { Symbol, ... } or export { X as Symbol }
            new RegExp(`export\\s*\\{[^}]*\\b${exportedSymbol}\\b[^}]*\\}`),
            // export function Symbol or export const Symbol
            new RegExp(
              `export\\s+(?:function|const|let|var|class)\\s+${exportedSymbol}\\b`,
            ),
            // minified pattern: Symbol2 as Symbol (common in bundled code)
            new RegExp(`\\b\\w+\\s+as\\s+${exportedSymbol}\\b`),
          ];

          const exportsSymbol = exportPatterns.some((pattern) =>
            pattern.test(chunkContent)
          );

          if (exportsSymbol) {
            mainChunkFile = chunkFile;
            break;
          }
        }

        if (mainChunkFile !== null) {
          // Ensure main chunk is in the list and at the front
          const mainIndex = chunks.indexOf(mainChunkFile);
          if (mainIndex > 0) {
            // Already in list but not first - move to front
            chunks.splice(mainIndex, 1);
            chunks.unshift(mainChunkFile);
          } else if (mainIndex === -1) {
            // Not in list from proxy imports - add to front
            // This happens when code splitting puts the component in a shared chunk
            chunks.unshift(mainChunkFile);
          }
          // mainIndex === 0 means already first, no change needed
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
    return hex.encodeHex(new Uint8Array(hashBuffer)).slice(0, 16);
  }

  private parseImports(content: string): string[] {
    const imports: string[] = [];

    // Match static imports: import ... from "..."
    // Use specific character class to prevent ReDoS (avoid unbounded [^;]+ pattern)
    const staticImportRegex =
      /import\s+(?:[\w\s{},*]+)\s+from\s*["']([\w./@-]+)["']/g;
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
