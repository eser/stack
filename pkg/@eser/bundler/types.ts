// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Bundler abstraction types for multi-backend bundling.
 *
 * This module provides a unified interface for different bundler backends
 * (Deno.bundle, Rolldown) with consistent configuration and output types.
 *
 * @module
 */

/**
 * Configuration for bundler operations.
 */
export interface BundlerConfig {
  /** Named entrypoints mapping name to file path. */
  readonly entrypoints: Readonly<Record<string, string>>;
  /** Output directory for bundled files. */
  readonly outputDir: string;
  /** Output format. */
  readonly format: "esm" | "cjs" | "iife";
  /** Target platform. */
  readonly platform: "browser" | "node" | "neutral";
  /** Enable code splitting into separate chunks. */
  readonly codeSplitting: boolean;
  /** Minify output code. */
  readonly minify: boolean;
  /** Sourcemap generation mode. */
  readonly sourcemap: boolean | "inline" | "external";
  /** Target environments (e.g., ["chrome100", "firefox100"]). */
  readonly target?: readonly string[];
  /** Global replacements (e.g., process.env.NODE_ENV). */
  readonly define?: Readonly<Record<string, string>>;
  /** External modules to exclude from bundle. */
  readonly external?: readonly string[];
  /** Bundler plugins. */
  readonly plugins?: readonly BundlerPlugin[];
  /** Path to deno.json/tsconfig.json. */
  readonly configPath?: string;
  /** Base path for URL rewriting. */
  readonly basePath?: string;
}

/**
 * Single output file from bundling.
 */
export interface BundleOutput {
  /** Output file path relative to outputDir. */
  readonly path: string;
  /** Bundled code content. */
  readonly code: Uint8Array;
  /** Source map content (if sourcemap enabled). */
  readonly map?: Uint8Array;
  /** File size in bytes. */
  readonly size: number;
  /** Content hash for cache busting. */
  readonly hash: string;
  /** Whether this is an entry chunk. */
  readonly isEntry?: boolean;
}

/**
 * Error from bundling operation.
 */
export interface BundleError {
  /** Error message. */
  readonly message: string;
  /** File path where error occurred. */
  readonly file?: string;
  /** Line number (1-based). */
  readonly line?: number;
  /** Column number (1-based). */
  readonly column?: number;
  /** Error severity. */
  readonly severity: "error" | "fatal";
}

/**
 * Warning from bundling operation.
 */
export interface BundleWarning {
  /** Warning message. */
  readonly message: string;
  /** File path where warning occurred. */
  readonly file?: string;
  /** Line number (1-based). */
  readonly line?: number;
  /** Column number (1-based). */
  readonly column?: number;
}

/**
 * Input file metadata in metafile.
 */
export interface InputMetadata {
  /** File size in bytes. */
  readonly bytes: number;
  /** Files this input imports. */
  readonly imports: readonly InputImport[];
}

/**
 * Import reference in input metadata.
 */
export interface InputImport {
  /** Import path. */
  readonly path: string;
  /** Import kind. */
  readonly kind: "import-statement" | "dynamic-import" | "require" | "url";
  /** Whether this is an external import. */
  readonly external?: boolean;
}

/**
 * Output file metadata in metafile.
 */
export interface OutputMetadata {
  /** File size in bytes. */
  readonly bytes: number;
  /** Input files that contributed to this output. */
  readonly inputs: Readonly<Record<string, { bytesInOutput: number }>>;
  /** Files this output imports. */
  readonly imports: readonly OutputImport[];
  /** Entry point that generated this output (if entry). */
  readonly entryPoint?: string;
}

/**
 * Import reference in output metadata.
 */
export interface OutputImport {
  /** Import path. */
  readonly path: string;
  /** Import kind. */
  readonly kind: "import-statement" | "dynamic-import" | "require" | "url";
}

/**
 * Metafile containing build graph information.
 */
export interface BundleMetafile {
  /** Map of input file paths to their metadata. */
  readonly inputs: Readonly<Record<string, InputMetadata>>;
  /** Map of output file paths to their metadata. */
  readonly outputs: Readonly<Record<string, OutputMetadata>>;
}

/**
 * Result of a bundling operation.
 */
export interface BundleResult {
  /** Whether bundling succeeded. */
  readonly success: boolean;
  /** Map of output paths to their content. */
  readonly outputs: ReadonlyMap<string, BundleOutput>;
  /** Errors encountered during bundling. */
  readonly errors?: readonly BundleError[];
  /** Warnings encountered during bundling. */
  readonly warnings?: readonly BundleWarning[];
  /** Build graph metadata. */
  readonly metafile?: BundleMetafile;
  /**
   * Entrypoint manifest mapping original entrypoint paths to their generated chunks.
   * Key: Original entrypoint path (e.g., "/path/to/counter.tsx")
   * Value: Array of chunk filenames [mainChunk, ...dependencies]
   */
  readonly entrypointManifest?: Readonly<Record<string, readonly string[]>>;
  /** Main entrypoint file name (e.g., "client.js"). */
  readonly entrypoint?: string;
  /** Total bundle size in bytes. */
  readonly totalSize?: number;
}

/**
 * Watcher for incremental builds.
 */
export interface BundleWatcher {
  /** Stop watching and clean up resources. */
  stop(): Promise<void>;
}

/**
 * Plugin build context for plugin setup.
 */
export interface PluginBuild {
  /** Register a resolve hook. */
  onResolve(
    options: { filter: RegExp; namespace?: string },
    callback: (args: ResolveArgs) => ResolveResult | Promise<ResolveResult>,
  ): void;
  /** Register a load hook. */
  onLoad(
    options: { filter: RegExp; namespace?: string },
    callback: (args: LoadArgs) => LoadResult | Promise<LoadResult>,
  ): void;
  /** Register a transform hook. */
  onTransform?(
    options: { filter: RegExp },
    callback: (
      args: TransformArgs,
    ) => TransformResult | Promise<TransformResult>,
  ): void;
}

/**
 * Arguments for resolve hook.
 */
export interface ResolveArgs {
  /** Import path being resolved. */
  readonly path: string;
  /** File that contains the import. */
  readonly importer: string;
  /** Namespace of the import. */
  readonly namespace: string;
  /** Import kind. */
  readonly kind: "import-statement" | "dynamic-import" | "require" | "url";
}

/**
 * Result from resolve hook.
 */
export interface ResolveResult {
  /** Resolved path. */
  path?: string;
  /** Namespace for the resolved module. */
  namespace?: string;
  /** Mark as external. */
  external?: boolean;
  /** Side effects flag. */
  sideEffects?: boolean;
}

/**
 * Arguments for load hook.
 */
export interface LoadArgs {
  /** Resolved path to load. */
  readonly path: string;
  /** Namespace of the module. */
  readonly namespace: string;
}

/**
 * Result from load hook.
 */
export interface LoadResult {
  /** Module contents. */
  contents?: string | Uint8Array;
  /** Content loader type. */
  loader?: "js" | "ts" | "tsx" | "jsx" | "json" | "css" | "text" | "binary";
  /** Resolved path (for sourcemaps). */
  resolveDir?: string;
}

/**
 * Arguments for transform hook.
 */
export interface TransformArgs {
  /** File path being transformed. */
  readonly path: string;
  /** File contents. */
  readonly code: string;
}

/**
 * Result from transform hook.
 */
export interface TransformResult {
  /** Transformed code. */
  code?: string;
  /** Source map. */
  map?: string;
}

/**
 * Bundler plugin interface.
 */
export interface BundlerPlugin {
  /** Plugin name for logging and debugging. */
  readonly name: string;
  /** Setup function called when plugin is registered. */
  setup(build: PluginBuild): void | Promise<void>;
}

/**
 * Unified bundler interface.
 *
 * Implementations: DenoBundlerBackend, RolldownBundlerBackend
 */
export interface Bundler {
  /** Backend name for logging and debugging. */
  readonly name: string;
  /** Bundle entrypoints with the given configuration. */
  bundle(config: BundlerConfig): Promise<BundleResult>;
  /** Watch for changes and rebuild (optional). */
  watch?(
    config: BundlerConfig,
    onChange: (result: BundleResult) => void,
  ): Promise<BundleWatcher>;
}

/**
 * Backend type identifier.
 */
export type BundlerBackend = "rolldown" | "deno-bundler";

/**
 * Options for creating a success result.
 */
export interface SuccessResultOptions {
  metafile?: BundleMetafile;
  entrypointManifest?: Readonly<Record<string, readonly string[]>>;
  entrypoint?: string;
  totalSize?: number;
}

/**
 * Create a successful bundle result.
 */
export const createSuccessResult = (
  outputs: ReadonlyMap<string, BundleOutput>,
  options?: SuccessResultOptions,
): BundleResult => ({
  success: true,
  outputs,
  metafile: options?.metafile,
  entrypointManifest: options?.entrypointManifest,
  entrypoint: options?.entrypoint,
  totalSize: options?.totalSize,
});

/**
 * Create a failed bundle result.
 */
export const createErrorResult = (
  errors: readonly BundleError[],
): BundleResult => ({
  success: false,
  outputs: new Map(),
  errors,
});
