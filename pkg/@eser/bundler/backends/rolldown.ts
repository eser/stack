// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Rolldown bundler backend.
 *
 * This backend wraps the Rolldown bundler (https://rolldown.rs)
 * with the unified Bundler interface. Rolldown is a Rust-based bundler
 * that is 10-30x faster than Rollup with Rollup-compatible plugin API.
 *
 * Note: Rolldown is currently in beta. Use with caution in production.
 *
 * @module
 */

import * as hex from "@std/encoding/hex";
import type {
  BundleMetafile,
  BundleOutput,
  Bundler,
  BundlerConfig,
  BundleResult,
  BundlerPlugin,
  BundleWatcher,
  LoadArgs,
  LoadResult,
  OutputMetadata,
  ResolveArgs,
  ResolveResult,
  SuccessResultOptions,
  TransformArgs,
  TransformResult,
} from "../types.ts";
import { createErrorResult, createSuccessResult } from "../types.ts";

/**
 * Internal plugin build context for collecting hooks.
 */
interface PluginBuildContext {
  resolvers: Array<{
    options: { filter: RegExp; namespace?: string };
    callback: (args: ResolveArgs) => ResolveResult | Promise<ResolveResult>;
  }>;
  loaders: Array<{
    options: { filter: RegExp; namespace?: string };
    callback: (args: LoadArgs) => LoadResult | Promise<LoadResult>;
  }>;
  transformers: Array<{
    options: { filter: RegExp };
    callback: (
      args: TransformArgs,
    ) => TransformResult | Promise<TransformResult>;
  }>;
}

/**
 * Chunk group configuration for code splitting.
 */
export interface ChunkGroup {
  /** Chunk group name (e.g., "vendor", "react"). */
  name: string;
  /** Regex to match module paths. */
  test: RegExp;
  /** Priority for chunk assignment (higher = more priority). */
  priority?: number;
  /** Minimum number of chunks that must share a module. */
  minChunks?: number;
  /** Whether to reuse existing chunks. */
  reuseExistingChunk?: boolean;
}

/**
 * Advanced chunking configuration.
 */
export interface AdvancedChunksConfig {
  /** Minimum chunk size in bytes before splitting. */
  minSize?: number;
  /** Maximum chunk size in bytes. */
  maxSize?: number;
  /** Chunk groups for splitting. */
  groups?: ChunkGroup[];
}

/**
 * Backend options specific to Rolldown.
 */
export interface RolldownBundlerBackendOptions {
  /** Custom entry point name (default: "main"). */
  entryName?: string;
  /** Advanced chunking configuration. */
  advancedChunks?: AdvancedChunksConfig;
  /** Enable tree shaking (default: true). */
  treeshake?: boolean;
  /** Preserve entry signatures for better tree shaking. */
  preserveEntrySignatures?:
    | "strict"
    | "allow-extension"
    | "exports-only"
    | false;
  /** Module side effects configuration. */
  moduleSideEffects?: boolean | "no-external" | string[];
}

/**
 * Rolldown bundler backend implementation.
 *
 * Uses the Rolldown bundler via npm/WASM.
 * Best for: Performance-critical builds, advanced code splitting.
 */
export class RolldownBundlerBackend implements Bundler {
  readonly name = "rolldown";
  private readonly options: RolldownBundlerBackendOptions;
  private rolldownModule: RolldownModule | null = null;

  constructor(options: RolldownBundlerBackendOptions = {}) {
    this.options = options;
  }

  async bundle(config: BundlerConfig): Promise<BundleResult> {
    try {
      const rolldown = await this.loadRolldown();

      const bundle = await rolldown.rolldown({
        input: config.entrypoints as Record<string, string>,
        external: config.external as string[] | undefined,
        plugins: this.adaptPlugins(config.plugins),
      });

      const sourcemapValue: boolean | "inline" | undefined =
        config.sourcemap === true
          ? true
          : config.sourcemap === "inline"
          ? "inline"
          : config.sourcemap === "external"
          ? true
          : undefined;

      const outputOptions: RolldownOutputOptions = {
        dir: config.outputDir,
        format: config.format as "es" | "cjs" | "iife",
        entryFileNames: "[name].js",
        chunkFileNames: "chunk-[hash].js",
        sourcemap: sourcemapValue,
        minify: config.minify,
        ...(this.options.advancedChunks !== undefined
          ? {
            advancedChunks: {
              minSize: this.options.advancedChunks.minSize ?? 20000,
              groups: this.options.advancedChunks.groups?.map((g) => ({
                name: g.name,
                test: g.test,
                priority: g.priority ?? 0,
              })),
            },
          }
          : {}),
      };

      const result = await bundle.write(outputOptions);
      await bundle.close();

      return await this.processRolldownOutput(result, config);
    } catch (error) {
      return createErrorResult([
        {
          message: error instanceof Error ? error.message : String(error),
          severity: "fatal",
        },
      ]);
    }
  }

  async watch(
    config: BundlerConfig,
    onChange: (result: BundleResult) => void,
  ): Promise<BundleWatcher> {
    const rolldown = await this.loadRolldown();

    const watcher = await rolldown.watch({
      input: config.entrypoints as Record<string, string>,
      external: config.external as string[] | undefined,
      plugins: this.adaptPlugins(config.plugins),
      output: {
        dir: config.outputDir,
        format: config.format as "es" | "cjs" | "iife",
        entryFileNames: "[name].js",
        chunkFileNames: "chunk-[hash].js",
        sourcemap: config.sourcemap === true || config.sourcemap === "external",
        minify: config.minify,
      },
    });

    watcher.on("event", async (event: RolldownWatchEvent) => {
      if (event.code === "BUNDLE_END") {
        const result = await this.bundle(config);
        onChange(result);
      } else if (event.code === "ERROR") {
        onChange(
          createErrorResult([
            {
              message: event.error?.message ?? "Watch error",
              severity: "error",
            },
          ]),
        );
      }
    });

    return {
      stop: async () => {
        await watcher.close();
      },
    };
  }

  private async loadRolldown(): Promise<RolldownModule> {
    if (this.rolldownModule !== null) {
      return this.rolldownModule;
    }

    try {
      // Try to import rolldown - it should be installed via npm
      // In Deno, this uses the npm: specifier
      // deno-lint-ignore no-explicit-any
      const rolldownImport = await import("npm:rolldown@latest") as any;

      // Adapt the actual rolldown API to our internal interface
      const module: RolldownModule = {
        rolldown: (options: RolldownInputOptions) =>
          rolldownImport.rolldown(options) as Promise<RolldownBundle>,
        watch: (options: RolldownWatchOptions) => {
          const watcher = rolldownImport.watch(options);
          return Promise.resolve(watcher as unknown as RolldownWatcher);
        },
      };
      this.rolldownModule = module;
      return module;
    } catch (error) {
      throw new Error(
        `Failed to load Rolldown. Make sure it's installed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private adaptPlugins(
    plugins?: readonly BundlerPlugin[],
  ): RollupPlugin[] {
    if (plugins === undefined || plugins.length === 0) {
      return [];
    }

    return plugins.map((plugin) => {
      const rollupPlugin: RollupPlugin = {
        name: plugin.name,
      };

      // Create a plugin build context for the plugin's setup function
      const pluginBuild: PluginBuildContext = {
        resolvers: [],
        loaders: [],
        transformers: [],
      };

      // Call the plugin's setup function synchronously
      // This collects the hooks the plugin wants to register
      const setupResult = plugin.setup({
        onResolve: (options, callback) => {
          pluginBuild.resolvers.push({ options, callback });
        },
        onLoad: (options, callback) => {
          pluginBuild.loaders.push({ options, callback });
        },
        onTransform: (options, callback) => {
          pluginBuild.transformers.push({ options, callback });
        },
      });

      // Handle async setup
      if (setupResult instanceof Promise) {
        rollupPlugin.buildStart = async function () {
          await setupResult;
        };
      }

      // Add resolveId hook if any resolvers were registered
      if (pluginBuild.resolvers.length > 0) {
        rollupPlugin.resolveId = async (
          source: string,
          importer: string | undefined,
        ) => {
          for (const resolver of pluginBuild.resolvers) {
            if (resolver.options.filter.test(source)) {
              const result = await resolver.callback({
                path: source,
                importer: importer ?? "",
                namespace: resolver.options.namespace ?? "file",
                kind: "import-statement",
              });
              if (result?.path !== undefined) {
                return {
                  id: result.path,
                  external: result.external,
                };
              }
            }
          }
          return null;
        };
      }

      // Add load hook if any loaders were registered
      if (pluginBuild.loaders.length > 0) {
        rollupPlugin.load = async (id: string) => {
          for (const loader of pluginBuild.loaders) {
            if (loader.options.filter.test(id)) {
              const result = await loader.callback({
                path: id,
                namespace: loader.options.namespace ?? "file",
              });
              if (result?.contents !== undefined) {
                return {
                  code: typeof result.contents === "string"
                    ? result.contents
                    : new TextDecoder().decode(result.contents),
                };
              }
            }
          }
          return null;
        };
      }

      // Add transform hook if any transformers were registered
      if (pluginBuild.transformers.length > 0) {
        rollupPlugin.transform = async (code: string, id: string) => {
          let currentCode = code;
          for (const transformer of pluginBuild.transformers) {
            if (transformer.options.filter.test(id)) {
              const result = await transformer.callback({
                path: id,
                code: currentCode,
              });
              if (result?.code !== undefined) {
                currentCode = result.code;
              }
            }
          }
          return currentCode !== code ? { code: currentCode } : null;
        };
      }

      return rollupPlugin;
    });
  }

  private async processRolldownOutput(
    result: RolldownWriteResult,
    config: BundlerConfig,
  ): Promise<BundleResult> {
    const entryName = this.options.entryName ?? "main";
    const expectedEntryFile = `${entryName}.js`;
    const outputs = new Map<string, BundleOutput>();
    const metaOutputs: Record<string, OutputMetadata> = {};
    const entrypointManifest: Record<string, string[]> = {};
    let mainEntrypoint = null;
    let totalSize = 0;

    for (const output of result.output) {
      if (output.type === "chunk") {
        // Post-process: Replace URL paths (matches DenoBundler behavior)
        let processedCode = output.code;
        if (config.basePath !== undefined) {
          processedCode = processedCode.replace(
            /\/_lime\/alive/g,
            `${config.basePath}/_lime/alive`,
          );
        }

        const code = new TextEncoder().encode(processedCode);
        const hash = await this.computeHash(code);

        const bundleOutput: BundleOutput = {
          path: output.fileName,
          code,
          size: code.length,
          hash,
          isEntry: output.isEntry,
          ...(output.map !== undefined
            ? { map: new TextEncoder().encode(JSON.stringify(output.map)) }
            : {}),
        };

        outputs.set(output.fileName, bundleOutput);
        totalSize += code.length;

        // Track main entrypoint - prefer the configured entryName
        if (output.isEntry) {
          if (output.fileName === expectedEntryFile) {
            mainEntrypoint = output.fileName;
          } else if (mainEntrypoint === null) {
            mainEntrypoint = output.fileName;
          }
        }

        // Build entrypoint manifest from Rolldown's facadeModuleId
        if (output.isEntry && output.facadeModuleId !== undefined) {
          const chunks = [output.fileName];
          // Add imported chunks as dependencies
          if (output.imports !== undefined) {
            for (const imp of output.imports) {
              if (!chunks.includes(imp)) {
                chunks.push(imp);
              }
            }
          }
          entrypointManifest[output.facadeModuleId] = chunks;
        }

        metaOutputs[output.fileName] = {
          bytes: code.length,
          inputs: {},
          imports: (output.imports ?? []).map((imp: string) => ({
            path: imp,
            kind: "import-statement" as const,
          })),
          ...(output.isEntry && output.facadeModuleId !== undefined
            ? { entryPoint: output.facadeModuleId }
            : {}),
        };
      } else if (output.type === "asset") {
        const content = typeof output.source === "string"
          ? new TextEncoder().encode(output.source)
          : output.source;
        const hash = await this.computeHash(content);

        outputs.set(output.fileName, {
          path: output.fileName,
          code: content,
          size: content.length,
          hash,
        });
        totalSize += content.length;
      }
    }

    const metafile: BundleMetafile = {
      inputs: {},
      outputs: metaOutputs,
    };

    const options: SuccessResultOptions = {
      metafile,
      entrypointManifest,
      entrypoint: mainEntrypoint ?? expectedEntryFile,
      totalSize,
    };

    return createSuccessResult(outputs, options);
  }

  private async computeHash(content: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      content as BufferSource,
    );
    return hex.encodeHex(new Uint8Array(hashBuffer)).slice(0, 16);
  }
}

/**
 * Create a Rolldown bundler backend instance.
 */
export const createRolldownBundlerBackend = (
  options: RolldownBundlerBackendOptions = {},
): RolldownBundlerBackend => new RolldownBundlerBackend(options);

/**
 * Preset configurations for common use cases.
 */
export const RolldownPresets = {
  /**
   * Default preset with sensible defaults for web applications.
   */
  default: (): RolldownBundlerBackendOptions => ({
    treeshake: true,
    advancedChunks: {
      minSize: 20000,
      groups: [],
    },
  }),

  /**
   * Preset for React applications with vendor splitting.
   * Separates React, React DOM, and other node_modules into separate chunks.
   */
  react: (): RolldownBundlerBackendOptions => ({
    treeshake: true,
    advancedChunks: {
      minSize: 10000,
      groups: [
        {
          name: "react-vendor",
          test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
          priority: 30,
        },
        {
          name: "vendor",
          test: /[\\/]node_modules[\\/]/,
          priority: 10,
        },
      ],
    },
  }),

  /**
   * Preset for libraries with minimal chunking.
   */
  library: (): RolldownBundlerBackendOptions => ({
    treeshake: true,
    preserveEntrySignatures: "strict",
    advancedChunks: {
      minSize: 0,
      groups: [],
    },
  }),

  /**
   * Preset for server-side rendering with aggressive code splitting.
   */
  ssr: (): RolldownBundlerBackendOptions => ({
    treeshake: true,
    moduleSideEffects: "no-external",
    advancedChunks: {
      minSize: 5000,
      groups: [
        {
          name: "react-vendor",
          test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
          priority: 30,
        },
        {
          name: "framework",
          test:
            /[\\/]node_modules[\\/](@radix-ui|@headlessui|lucide-react)[\\/]/,
          priority: 20,
        },
        {
          name: "vendor",
          test: /[\\/]node_modules[\\/]/,
          priority: 10,
        },
      ],
    },
  }),

  /**
   * Preset for maximum performance with aggressive optimization.
   */
  performance: (): RolldownBundlerBackendOptions => ({
    treeshake: true,
    moduleSideEffects: false,
    advancedChunks: {
      minSize: 30000,
      maxSize: 250000,
      groups: [
        {
          name: "react",
          test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
          priority: 40,
        },
        {
          name: "ui",
          test: /[\\/]node_modules[\\/](@radix-ui|@headlessui|cmdk)[\\/]/,
          priority: 30,
        },
        {
          name: "utils",
          test:
            /[\\/]node_modules[\\/](clsx|tailwind-merge|class-variance-authority)[\\/]/,
          priority: 20,
        },
        {
          name: "vendor",
          test: /[\\/]node_modules[\\/]/,
          priority: 10,
        },
      ],
    },
  }),
} as const;

/**
 * Create a Rolldown backend with a preset configuration.
 *
 * @param preset - Preset name or custom options
 * @param overrides - Options to merge with preset
 * @returns Configured Rolldown backend
 *
 * @example
 * ```ts
 * // Use React preset
 * const bundler = createRolldownWithPreset("react");
 *
 * // Use preset with overrides
 * const bundler = createRolldownWithPreset("react", {
 *   advancedChunks: { minSize: 5000 }
 * });
 * ```
 */
export function createRolldownWithPreset(
  preset: keyof typeof RolldownPresets | RolldownBundlerBackendOptions,
  overrides?: Partial<RolldownBundlerBackendOptions>,
): RolldownBundlerBackend {
  const baseOptions = typeof preset === "string"
    ? RolldownPresets[preset]()
    : preset;

  const mergedOptions: RolldownBundlerBackendOptions = {
    ...baseOptions,
    ...overrides,
    advancedChunks: overrides?.advancedChunks !== undefined
      ? {
        ...baseOptions.advancedChunks,
        ...overrides.advancedChunks,
        groups: overrides.advancedChunks.groups ??
          baseOptions.advancedChunks?.groups,
      }
      : baseOptions.advancedChunks,
  };

  return new RolldownBundlerBackend(mergedOptions);
}

// Type definitions for Rolldown module (external dependency)

interface RolldownModule {
  rolldown(options: RolldownInputOptions): Promise<RolldownBundle>;
  watch(options: RolldownWatchOptions): Promise<RolldownWatcher>;
}

interface RolldownInputOptions {
  input: Record<string, string>;
  external?: string[];
  plugins?: RollupPlugin[];
}

interface RolldownOutputOptions {
  dir: string;
  format: "es" | "cjs" | "iife";
  entryFileNames?: string;
  chunkFileNames?: string;
  sourcemap?: boolean | "inline";
  minify?: boolean;
  advancedChunks?: {
    minSize?: number;
    groups?: Array<{
      name: string;
      test: RegExp;
      priority?: number;
    }>;
  };
}

interface RolldownBundle {
  write(options: RolldownOutputOptions): Promise<RolldownWriteResult>;
  close(): Promise<void>;
}

interface RolldownWriteResult {
  output: Array<RolldownOutputChunk | RolldownOutputAsset>;
}

interface RolldownOutputChunk {
  type: "chunk";
  code: string;
  fileName: string;
  isEntry: boolean;
  facadeModuleId?: string;
  imports?: string[];
  map?: unknown;
}

interface RolldownOutputAsset {
  type: "asset";
  fileName: string;
  source: string | Uint8Array;
}

interface RolldownWatchOptions extends RolldownInputOptions {
  output: RolldownOutputOptions;
}

interface RolldownWatcher {
  on(event: "event", callback: (event: RolldownWatchEvent) => void): void;
  close(): Promise<void>;
}

interface RolldownWatchEvent {
  code: "START" | "BUNDLE_START" | "BUNDLE_END" | "END" | "ERROR";
  error?: { message: string };
}

interface RollupPlugin {
  name: string;
  buildStart?(): void | Promise<void>;
  resolveId?(
    source: string,
    importer: string | undefined,
  ): Promise<{ id: string; external?: boolean } | null> | {
    id: string;
    external?: boolean;
  } | null;
  load?(id: string): Promise<{ code: string } | null> | { code: string } | null;
  transform?(
    code: string,
    id: string,
  ): Promise<{ code: string } | null> | { code: string } | null;
}
