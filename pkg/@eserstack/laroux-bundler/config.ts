// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Build Configuration
 * Static presets for bundler settings
 */

/**
 * Bundler backend types.
 * - "deno-bundler": Uses native Deno.bundle() API (stable, requires --unstable-bundle)
 * - "rolldown": Uses Rolldown bundler (faster, advanced chunking)
 */
export type BundlerBackend = "deno-bundler" | "rolldown";

/**
 * Build settings type
 */
export type BuildSettings = {
  minify: boolean;
  sourceMaps: boolean;
  codeSplitting: boolean;
  define: Record<string, string>;
};

/**
 * Production settings - used by PrebuiltBundler
 * Optimized for deployment: minified, no source maps
 */
export const PRODUCTION_SETTINGS: BuildSettings = {
  minify: true,
  sourceMaps: false,
  codeSplitting: true,
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.DEBUG": '"false"',
  },
};

/**
 * Development settings - used by RuntimeBundler
 * Optimized for debugging: no minification, source maps enabled
 */
export const DEVELOPMENT_SETTINGS: BuildSettings = {
  minify: false,
  sourceMaps: true,
  codeSplitting: false,
  define: {
    "process.env.NODE_ENV": '"development"',
    "process.env.DEBUG": '"false"',
  },
};
