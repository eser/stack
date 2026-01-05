// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Bundler Types
 *
 * Imports shared types from @eser/laroux/config and defines bundler-specific types.
 * Core converts its AppConfig to BuildConfig when calling bundler functions.
 */

import type {
  FontDefinition,
  ResolvedBrowserShimsConfig,
  ResolvedImageConfig,
} from "@eser/laroux/config";

// Re-export shared types for convenience
export type {
  FontDefinition,
  FontDisplay,
  FontProvider,
  FontStyle,
  FontWeight,
  ImageFormat,
  ImageOutputFormat,
  ImagePlaceholder,
  LogLevel,
  ResolvedBrowserShimsConfig,
  ResolvedImageConfig,
  ResolvedImageQuality,
} from "@eser/laroux/config";

// ============================================================================
// Build Configuration (Bundler-specific)
// ============================================================================

/**
 * Build configuration for the bundler
 *
 * This interface contains only what the bundler needs to perform builds.
 * Core's AppConfig is converted to BuildConfig when calling bundler functions.
 */
export type BuildConfig = {
  /** Project root directory (absolute path) */
  projectRoot: string;

  /** Source directory containing components (absolute path) */
  srcDir: string;

  /** Distribution directory for built assets (absolute path) */
  distDir: string;

  /** Log level for build output */
  logLevel: "trace" | "debug" | "info" | "warn" | "error" | "fatal";

  /** Font configuration */
  fonts: FontDefinition[];

  /** Image optimization configuration */
  images: ResolvedImageConfig;

  /** Generate TypeScript .d.ts files for CSS modules */
  cssModuleTypes: boolean;

  /** Disable auto-injection of @reference directive in CSS modules */
  noCssModuleAutoReference: boolean;

  /** Browser shims for client-side bundling */
  browserShims: ResolvedBrowserShimsConfig;
};

// ============================================================================
// Build Errors (Bundler-specific)
// ============================================================================

/**
 * Build error class for bundler errors
 * Simple error class without external dependencies
 */
export class BuildError extends Error {
  constructor(
    message: string,
    public code: string,
    public hint?: string,
  ) {
    super(message);
    this.name = "BuildError";
  }
}

/**
 * Error factories for common build errors
 */
export const buildErrors = {
  /** CSS processing error */
  cssError: (reason: string): BuildError =>
    new BuildError(
      `CSS processing failed: ${reason}`,
      "BUILD104",
      "Check your CSS files and configuration.",
    ),

  /** Module not found */
  moduleNotFound: (modulePath: string): BuildError =>
    new BuildError(
      `Module not found: ${modulePath}`,
      "BUILD100",
      "Check that the file exists and the import path is correct.",
    ),

  /** Build failed */
  buildFailed: (reason: string): BuildError =>
    new BuildError(
      `Build failed: ${reason}`,
      "BUILD101",
      "Check the error details above and fix any syntax or type errors.",
    ),
};
