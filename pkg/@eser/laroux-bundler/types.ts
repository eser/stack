// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Bundler Types
 *
 * Defines bundler-specific types and shared configuration types.
 * Types that overlap with @eser/laroux/config are duplicated here
 * to avoid a circular package dependency (laroux -> laroux-bundler -> laroux).
 */

// =============================================================================
// Shared types (mirrored from @eser/laroux/config to break circular dep)
// =============================================================================

/** LogTape log levels */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/** Font weight values */
export type FontWeight =
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900";

/** Font style values */
export type FontStyle = "normal" | "italic";

/** Font display strategy */
export type FontDisplay = "auto" | "block" | "swap" | "fallback" | "optional";

/** Font provider types */
export type FontProvider = "google" | "local";

/**
 * Font definition for configuration
 * Supports Google Fonts and local fonts
 */
export type FontDefinition = {
  /** Font provider (google or local) */
  provider: FontProvider;
  /** Font family name */
  family: string;
  /** Font weights to include */
  weights?: FontWeight[];
  /** Font styles to include */
  styles?: FontStyle[];
  /** Font display strategy */
  display?: FontDisplay;
  /** Character subsets (for Google Fonts) */
  subsets?: string[];
  /** CSS variable name (e.g., "--font-sans") */
  variable?: string;
  /** Fallback font families */
  fallback?: string[];
  /** Source path for local fonts */
  src?: string;
};

/** Supported modern image formats */
export type ImageFormat = "webp" | "avif";

/** Image output format types for build optimization */
export type ImageOutputFormat = ImageFormat | "original";

/** Image placeholder types */
export type ImagePlaceholder = "blur" | "empty" | "none";

/** Resolved image quality configuration */
export type ResolvedImageQuality = {
  webp: number;
  avif: number;
  jpeg: number;
  png: number;
};

/** Resolved image configuration */
export type ResolvedImageConfig = {
  formats: ImageOutputFormat[];
  widths: number[];
  quality: ResolvedImageQuality;
  placeholder: ImagePlaceholder;
};

/**
 * Resolved browser shims configuration (all properties guaranteed)
 */
export type ResolvedBrowserShimsConfig = {
  jsr: Record<string, string>;
  nodeBuiltins: Record<string, string>;
};

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

  /**
   * Server-side external packages (not bundled into server components).
   * These packages resolve from the app's node_modules at runtime.
   * Default: ["@eser/laroux", "@eser/laroux-server"]
   */
  serverExternals: string[];
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
