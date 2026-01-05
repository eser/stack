// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Framework Plugin Interface
 *
 * This interface defines hooks that framework adapters (React, Vue, etc.)
 * can implement to provide framework-specific build functionality.
 *
 * The bundler is framework-agnostic - it calls these hooks without
 * knowing which framework is being used.
 */

import type { BuildCache } from "./build-cache.ts";
import type { BundlerPlugin } from "@eser/bundler/backends";

/**
 * Client component metadata
 * Framework-agnostic representation of a component that runs on the client
 */
export type ClientComponent = {
  /** Absolute file path */
  filePath: string;
  /** Relative path from project root (ES Module path) */
  relativePath: string;
  /** Export names (default or named) */
  exportNames: string[];
};

/**
 * Module map entry for a single client component
 */
export type ModuleMapEntry = {
  /** Module ID/path for the client component */
  id: string;
  /** Chunk names that contain this component */
  chunks: string[];
  /** Export name (default, named export, or * for all exports) */
  name: string;
};

/**
 * Module map for client component resolution
 * Maps module paths to their bundle information
 */
export type ModuleMap = Record<string, ModuleMapEntry>;

/**
 * Transform result for a single component
 */
export type TransformResult = {
  /** Original file path */
  originalPath: string;
  /** Path to the transformed proxy file */
  transformedPath: string;
};

/**
 * Framework plugin interface
 *
 * Frameworks like React, Vue, Solid can implement this interface
 * to provide their specific build hooks.
 */
export type FrameworkPlugin = {
  /** Plugin name for logging */
  name: string;

  /**
   * Analyze source directory and find client components
   * For React: finds "use client" directives
   */
  analyzeClientComponents?: (
    srcDir: string,
    projectRoot: string,
    cache?: BuildCache,
  ) => Promise<ClientComponent[]>;

  /**
   * Get all component files in the source directory
   */
  getAllComponents?: (srcDir: string) => Promise<string[]>;

  /**
   * Transform client components to server-side proxies
   * For React RSC: creates client references
   */
  transformClientComponents?: (
    components: ClientComponent[],
    outputDir: string,
    projectRoot: string,
  ) => Promise<TransformResult[]>;

  /**
   * Generate transform manifest for tracking
   */
  generateTransformManifest?: (
    transformResults: TransformResult[],
    outputPath: string,
    projectRoot: string,
  ) => Promise<void>;

  /**
   * Create module map for client component resolution
   */
  createModuleMap?: (
    components: ClientComponent[],
  ) => Promise<ModuleMap>;

  /**
   * Save module map to disk
   */
  saveModuleMap?: (
    moduleMap: ModuleMap,
    outputPath: string,
  ) => Promise<void>;

  /**
   * Create client manifest for component metadata
   */
  createClientManifest?: (
    components: ClientComponent[],
  ) => Promise<ModuleMap>;

  /**
   * Rewrite server component imports
   */
  rewriteServerComponents?: (
    serverComponentPaths: string[],
    transformResults: TransformResult[],
    cssModulePaths: string[],
    outputDir: string,
    projectRoot: string,
  ) => Promise<void>;

  /**
   * Rewrite CSS module imports in source files
   */
  rewriteCssModuleImports?: (
    srcDir: string,
    cssModulePaths: string[],
    projectRoot: string,
  ) => Promise<void>;

  /**
   * Create the client entry point for bundling
   * Returns the path to the generated entry file
   */
  createClientEntry?: (
    components: ClientComponent[],
    projectRoot: string,
    distDir: string,
  ) => Promise<string>;

  /**
   * Get additional bundler plugins for the client build
   */
  getClientBundlerPlugins?: (projectRoot: string) => BundlerPlugin[];

  /**
   * Get additional bundler plugins for the server build
   */
  getServerBundlerPlugins?: (projectRoot: string) => BundlerPlugin[];
};

/**
 * No-op plugin for when no framework is configured
 * Returns empty arrays and does nothing for all hooks
 */
export const noopPlugin: FrameworkPlugin = {
  name: "noop",
  analyzeClientComponents: () => Promise.resolve([]),
  getAllComponents: () => Promise.resolve([]),
  transformClientComponents: () => Promise.resolve([]),
};
