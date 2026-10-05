// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Deno Bundler backend using native Deno.bundle() API.
 *
 * This backend wraps the Deno.bundle() API (introduced in Deno 2.4.0)
 * with the unified Bundler interface. Requires --unstable-bundle flag.
 *
 * @module
 */

/**
 * Type declarations for Deno.bundle() unstable API.
 * @see https://deno.land/api?unstable=&s=Deno.bundle
 */
declare namespace Deno {
  namespace bundle {
    interface Options {
      entrypoints: string[];
      outputDir: string;
      format?: "esm";
      codeSplitting?: boolean;
      minify?: boolean;
      platform?: "browser" | "deno";
      sourcemap?: "external" | "inline";
      external?: string[];
    }
  }

  interface BundleResult {
    success: boolean;
    errors?: unknown[];
    diagnostics?: unknown[];
  }

  function bundle(options: bundle.Options): Promise<BundleResult>;
}

import * as hex from "@std/encoding/hex";
import * as logging from "@eserstack/logging";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
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
import * as types from "../types.ts";
import * as layout from "./deno-bundle-layout.ts";

const bundlerLogger = logging.logger.getLogger(["bundler", "deno-bundler"]);

/**
 * Backend options specific to Deno Bundler.
 */
export interface DenoBundlerBackendOptions {
  /**
   * Build ID for cache busting. The bundle gets an extra `build-id.js` entry
   * that exports it as `BUILD_ID`.
   */
  buildId?: string;
  /**
   * Key of the main entry in `config.entrypoints` (default: "main"). The
   * result's `entrypoint` is `${entryName}.js` when an entry has this key, and
   * the first entry's output otherwise.
   */
  entryName?: string;
}

/** One entry point Deno.bundle() builds, and the name its output gets. */
interface DenoEntry {
  /** The key in `config.entrypoints`, or null for the build ID entry. */
  readonly key: string | null;
  /** The entry point file, as given. */
  readonly path: string;
  /** The output name: `${key}.js`, or `build-id.js`. */
  readonly outputName: string;
}

/** A bundle file after renaming and post-processing. */
interface ProcessedFile {
  readonly finalName: string;
  readonly entry: DenoEntry | undefined;
  readonly code: Uint8Array;
  readonly hash: string;
  readonly imports: readonly layout.BundleImport[];
  readonly map: { readonly code: Uint8Array; readonly hash: string } | null;
}

const BUILD_ID_OUTPUT = "build-id.js";

/**
 * Deno Bundler backend implementation.
 *
 * Uses the native Deno.bundle() API for bundling. Each entry's output is
 * named after its key in `config.entrypoints` (`${key}.js`), as the Rolldown
 * backend names them, whatever directory layout Deno.bundle() used.
 */
export class DenoBundlerBackend implements Bundler {
  /** The backend name, as `createBundler` takes it. */
  readonly name = "deno-bundler";
  private readonly options: DenoBundlerBackendOptions;

  /** Creates the backend; see {@link DenoBundlerBackendOptions}. */
  constructor(options: DenoBundlerBackendOptions = {}) {
    this.options = options;
  }

  /**
   * Bundles `config.entrypoints` with Deno.bundle() and writes the renamed
   * outputs to `config.outputDir`. A failed build, or an output layout this
   * backend does not recognize, comes back as an error result.
   */
  async bundle(config: BundlerConfig): Promise<BundleResult> {
    const tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "deno-bundle-",
    });

    try {
      const entries: DenoEntry[] = Object.entries(config.entrypoints).map((
        [key, path],
      ) => ({ key, path, outputName: `${key}.js` }));

      if (this.options.buildId !== undefined) {
        const buildIdEntryPath = crossRuntime.runtime.path.join(
          tempDir,
          "_build-id-entry.ts",
        );
        await crossRuntime.runtime.fs.writeTextFile(
          buildIdEntryPath,
          `export const BUILD_ID = ${JSON.stringify(this.options.buildId)};\n`,
        );
        entries.unshift({
          key: null,
          path: buildIdEntryPath,
          outputName: BUILD_ID_OUTPUT,
        });
      }

      const allEntrypoints = entries.map((entry) => entry.path);

      // Deno.bundle supports "browser" and "deno" platforms
      // Map the unified platform config to Deno.bundle's platform options:
      // - "browser" → "browser"
      // - "node" → "deno" (server-side)
      // - "neutral" → "deno" (default to server-side)
      const platform = config.platform === "browser" ? "browser" : "deno";

      // Convert sourcemap config to Deno.bundle format
      // Deno.bundle accepts "external" | "inline" | undefined
      const sourcemapValue = config.sourcemap === true
        ? "external"
        : config.sourcemap === false
        ? undefined
        : config.sourcemap;

      const options: Deno.bundle.Options = {
        entrypoints: allEntrypoints,
        outputDir: tempDir,
        format: "esm",
        codeSplitting: config.codeSplitting,
        minify: config.minify,
        platform,
        sourcemap: sourcemapValue,
      };

      // Deno.bundle() has no `define` option, so config.define is applied to
      // the bundled output in processOutput (applyDefineReplacements).

      if (config.external !== undefined) {
        options.external = config.external as string[];
      }

      bundlerLogger.debug("Calling Deno.bundle", {
        entrypoints: allEntrypoints.slice(0, 3),
        outputDir: tempDir,
        external: options.external,
        platform: options.platform,
      });

      const result = await Deno.bundle(options);

      bundlerLogger.debug("Deno.bundle result", {
        success: result.success,
        errors: (result as unknown as { errors?: unknown[] }).errors?.length ??
          0,
      });

      if (!result.success) {
        // result.errors contains the actual errors from Deno.bundle
        const bundleErrors =
          (result as unknown as { errors?: Array<{ text: string }> })
            .errors ?? [];
        const errors: BundleError[] = bundleErrors.map((e) => ({
          message: e.text ?? this.extractErrorMessage(e),
          severity: "error" as const,
        }));
        return types.createErrorResult(errors);
      }

      return await this.processOutput(tempDir, config, entries);
    } catch (error) {
      return types.createErrorResult([{
        message: error instanceof Error ? error.message : String(error),
        severity: "fatal",
      }]);
    } finally {
      try {
        await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
      } catch {
        // Best-effort cleanup: a leftover temp dir must not replace the
        // bundle result or the error that is already being returned.
      }
    }
  }

  /**
   * Rebundles whenever a file changes in an entry point's directory and passes
   * each result to `onChange`.
   */
  watch(
    config: BundlerConfig,
    onChange: (result: BundleResult) => void,
  ): Promise<BundleWatcher> {
    let running = true;
    const watchPaths = Object.values(config.entrypoints).map((p) =>
      crossRuntime.runtime.path.dirname(p)
    );
    const uniquePaths = [...new Set(watchPaths)];

    // Use cross-runtime fs.watch for file watching
    const watcher = crossRuntime.runtime.fs.watch(uniquePaths, {
      recursive: true,
    });

    const watchLoop = async () => {
      for await (const _event of watcher) {
        if (!running) break;
        const result = await this.bundle(config);
        onChange(result);
      }
    };

    // bundle() reports build failures through onChange; this catch only sees
    // a failing watcher or onChange callback, which ends the watch loop.
    watchLoop().catch((error) =>
      bundlerLogger
        .with({
          watchPaths: uniquePaths,
          error: error instanceof Error ? error.message : String(error),
        })
        .error("deno-bundler watch loop stopped")
    );

    return Promise.resolve({
      stop: () => {
        running = false;
        watcher.close();
        return Promise.resolve();
      },
    });
  }

  /** The message of a Deno.bundle() error that carries no `text`. */
  private extractErrorMessage(error: unknown): string {
    if (error === null || error === undefined) return "Unknown error";
    if (typeof error === "object" && "message" in error) {
      return String((error as { message: unknown }).message);
    }
    return String(error);
  }

  /**
   * Renames the files Deno.bundle() wrote in `tempDir` after the entry keys,
   * post-processes them, and builds the result.
   */
  private async processOutput(
    tempDir: string,
    config: BundlerConfig,
    entries: readonly DenoEntry[],
  ): Promise<BundleResult> {
    const path = crossRuntime.runtime.path;
    const entryName = this.options.entryName ?? "main";
    const denoNames = await collectBundleFiles(tempDir);
    const writtenNames = new Set(denoNames);

    // Where Deno.bundle() put each entry, and the name the entry key asks for.
    const outbase = layout.lowestCommonAncestorDir(
      entries.map((entry) => entry.path),
    );
    const finalNames = new Map<string, string>();
    const entriesByDenoName = new Map<string, DenoEntry>();

    for (const entry of entries) {
      const denoName = layout.denoOutputName(entry.path, outbase);

      if (!writtenNames.has(denoName)) {
        return types.createErrorResult([{
          message: `deno-bundler: Deno.bundle wrote no ${denoName} for entry ${
            entry.key ?? "build-id"
          } (${entry.path}); it wrote ${
            denoNames.join(", ")
          }. Its output layout may have changed; check the Deno version.`,
          severity: "fatal",
        }]);
      }

      finalNames.set(denoName, entry.outputName);
      entriesByDenoName.set(denoName, entry);
    }

    // Chunks keep the names Deno.bundle() gave them.
    const jsNames = denoNames.filter((name) => name.endsWith(".js"));
    for (const name of jsNames) {
      if (!finalNames.has(name)) {
        finalNames.set(name, name);
      }
    }

    const outputDir = path.resolve(config.outputDir);

    // Each file is read, rewritten and hashed on its own; the results are
    // applied in file order below. The count is bounded by the bundle's own
    // output, which is held in memory anyway.
    const processFile = async (denoName: string): Promise<ProcessedFile> => {
      const finalName = finalNames.get(denoName) ?? denoName;
      let content = await crossRuntime.runtime.fs.readTextFile(
        path.join(tempDir, denoName),
      );

      // Post-process: Replace URL paths
      if (config.basePath !== undefined) {
        content = content.replace(
          /\/_lime\/alive/g,
          `${config.basePath}/_lime/alive`,
        );
      }

      // Post-process: Apply define replacements
      if (config.define !== undefined) {
        content = applyDefineReplacements(
          content,
          config.define as Record<string, string>,
        );
      }

      const rewritten = layout.rewriteRelativeImports(
        content,
        denoName,
        finalName,
        finalNames,
      );
      content = rewritten.code;

      let map: ProcessedFile["map"] = null;
      const mapDenoName = `${denoName}.map`;
      const fromDir = path.dirname(path.join(tempDir, denoName));
      const toDir = path.dirname(path.join(outputDir, finalName));
      if (!writtenNames.has(mapDenoName)) {
        // With sourcemap "inline" the map sits at the end of the code.
        content = layout.relocateInlineSourceMap(content, fromDir, toDir);
      } else {
        const mapText = layout.relocateSourceMap(
          await crossRuntime.runtime.fs.readTextFile(
            path.join(tempDir, mapDenoName),
          ),
          fromDir,
          toDir,
        );
        const mapCode = new TextEncoder().encode(mapText);
        map = { code: mapCode, hash: await this.computeHash(mapCode) };
        content = layout.setSourceMappingUrl(
          content,
          `${path.basename(finalName)}.map`,
        );
      }

      const code = new TextEncoder().encode(content);

      return {
        finalName,
        entry: entriesByDenoName.get(denoName),
        code,
        hash: await this.computeHash(code),
        imports: rewritten.imports,
        map,
      };
    };

    const processedFiles = await Promise.all(jsNames.map(processFile));

    const outputs = new Map<string, BundleOutput>();
    const metaOutputs: Record<string, OutputMetadata> = {};
    const entrypointManifest: Record<string, string[]> = {};
    let totalSize = 0;

    for (const file of processedFiles) {
      outputs.set(file.finalName, {
        path: file.finalName,
        code: file.code,
        ...(file.map !== null ? { map: file.map.code } : {}),
        size: file.code.length,
        hash: file.hash,
        isEntry: file.entry !== undefined,
      });
      totalSize += file.code.length;

      metaOutputs[file.finalName] = {
        bytes: file.code.length,
        inputs: {},
        imports: file.imports,
        ...(file.entry !== undefined ? { entryPoint: file.entry.path } : {}),
      };

      // Like the Rolldown backend: the entry's own file first, then the files
      // it imports statically.
      if (file.entry !== undefined && file.entry.key !== null) {
        entrypointManifest[file.entry.path] = [
          file.finalName,
          ...file.imports
            .filter((imported) => imported.kind === "import-statement")
            .map((imported) => imported.path),
        ];
      }
    }

    // Source maps are outputs of their own as well, so they get written.
    for (const file of processedFiles) {
      if (file.map !== null) {
        const mapName = `${file.finalName}.map`;
        outputs.set(mapName, {
          path: mapName,
          code: file.map.code,
          size: file.map.code.length,
          hash: file.map.hash,
          isEntry: false,
        });
        totalSize += file.map.code.length;
      }
    }

    await writeOutputs(outputDir, outputs);

    const metafile: BundleMetafile = {
      inputs: {},
      outputs: metaOutputs,
    };

    const firstEntry = entries.find((entry) => entry.key !== null);
    const mainOutput = `${entryName}.js`;
    const options: SuccessResultOptions = {
      metafile,
      entrypointManifest,
      entrypoint: entries.some((entry) => entry.key === entryName)
        ? mainOutput
        : firstEntry?.outputName ?? mainOutput,
      totalSize,
    };

    return types.createSuccessResult(outputs, options);
  }

  /** The first 16 hex digits of the SHA-256 of `content`. */
  private async computeHash(content: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      content as BufferSource,
    );
    return hex.encodeHex(new Uint8Array(hashBuffer)).slice(0, 16);
  }
}

/**
 * Lists the `.js` and `.map` files under `dir`, as `/`-separated paths
 * relative to it, sorted so the result does not depend on directory order.
 */
async function collectBundleFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  const walk = async (current: string, prefix: string): Promise<void> => {
    for await (const entry of crossRuntime.runtime.fs.readDir(current)) {
      const relativeName = prefix === ""
        ? entry.name
        : `${prefix}/${entry.name}`;

      if (entry.isDirectory) {
        await walk(
          crossRuntime.runtime.path.join(current, entry.name),
          relativeName,
        );
      } else if (
        entry.isFile &&
        (entry.name.endsWith(".js") || entry.name.endsWith(".map"))
      ) {
        files.push(relativeName);
      }
    }
  };

  await walk(dir, "");

  return files.sort();
}

/** Writes every output under `outputDir`, creating nested directories. */
async function writeOutputs(
  outputDir: string,
  outputs: ReadonlyMap<string, BundleOutput>,
): Promise<void> {
  const path = crossRuntime.runtime.path;
  await crossRuntime.runtime.fs.mkdir(outputDir, { recursive: true });

  await Promise.all(
    [...outputs.values()].map(async (output) => {
      const outputPath = path.join(outputDir, output.path);
      // A recursive mkdir also succeeds when another write created it.
      await crossRuntime.runtime.fs.mkdir(path.dirname(outputPath), {
        recursive: true,
      });
      await crossRuntime.runtime.fs.writeFile(outputPath, output.code);
    }),
  );
}

/**
 * Apply define replacements to bundled code.
 * Replaces identifiers like `process.env.NODE_ENV` with their defined values.
 */
function applyDefineReplacements(
  code: string,
  defines: Record<string, string>,
): string {
  const keys = Object.keys(defines);
  if (keys.length === 0) {
    return code;
  }

  // Sort by length (longest first) to avoid partial matches
  keys.sort((a, b) => b.length - a.length);

  // Quick check: does code contain any of the keys?
  let hasMatch = false;
  for (const key of keys) {
    if (code.includes(key)) {
      hasMatch = true;
      break;
    }
  }
  if (!hasMatch) {
    return code;
  }

  // Escape regex special characters and create pattern
  const escapedKeys = keys.map((key) =>
    key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const pattern = new RegExp(`\\b(${escapedKeys.join("|")})\\b`, "g");

  return code.replace(pattern, (match) => defines[match] ?? match);
}

/**
 * Create a Deno Bundler backend instance.
 */
export const createDenoBundlerBackend = (
  options: DenoBundlerBackendOptions = {},
): DenoBundlerBackend => new DenoBundlerBackend(options);
