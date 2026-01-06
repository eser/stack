// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Configuration Types
 * Type-safe configuration definitions for laroux.js
 * Framework-agnostic - no runtime dependencies
 */

import type { ImageFormat } from "../image/types.ts";

// Re-export ImageFormat for convenience
export type { ImageFormat };

// =============================================================================
// Log Level
// =============================================================================

/** LogTape log levels */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

// =============================================================================
// Font Types
// =============================================================================

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

// =============================================================================
// Image Types
// =============================================================================

/** Image output format types for build optimization (extends ImageFormat with "original" to preserve source format) */
export type ImageOutputFormat = ImageFormat | "original";

/** Image placeholder types */
export type ImagePlaceholder = "blur" | "empty" | "none";

/**
 * Image optimization configuration
 */
export type ImageConfig = {
  /** Output formats to generate (default: ["webp", "original"]) */
  formats?: ImageOutputFormat[];
  /** Responsive widths to generate (default: [640, 768, 1024, 1280, 1920]) */
  widths?: number[];
  /** Quality settings per format */
  quality?: {
    webp?: number;
    avif?: number;
    jpeg?: number;
    png?: number;
  };
  /** Placeholder strategy (default: "blur") */
  placeholder?: ImagePlaceholder;
};

// =============================================================================
// SSR Types
// =============================================================================

/** SSR mode options */
export type SSRMode = "always" | "production-only" | "disabled";

/** SSR streaming mode options */
export type SSRStreamMode =
  | "streaming-classic"
  | "streaming-optimal"
  | "await-all";

/**
 * Server-Side Rendering (SSR) configuration
 */
export type SSRConfig = {
  /**
   * SSR mode:
   * - "always": Enable SSR in both dev and production (default)
   * - "production-only": Enable SSR only in production builds
   * - "disabled": Disable SSR, use pure client-side rendering
   */
  mode?: SSRMode;

  /**
   * Streaming mode:
   * - "streaming-optimal": Sync RSC chunks inline + async via /rsc (recommended)
   * - "streaming-classic": Stream HTML progressively, client fetches all RSC via /rsc endpoint
   * - "await-all": Wait for all async components before sending HTML
   */
  streamMode?: SSRStreamMode;
};

// =============================================================================
// Critical CSS Types
// =============================================================================

/**
 * Critical CSS extraction configuration
 */
export type CriticalCssConfig = {
  /** Enable critical CSS extraction (default: false) */
  enabled?: boolean;
  /** Viewport dimensions for above-the-fold calculation */
  viewport?: {
    width?: number;
    height?: number;
  };
  /** Selectors to always include in critical CSS */
  forceInclude?: string[];
  /** Selectors to always exclude from critical CSS */
  forceExclude?: string[];
};

// =============================================================================
// Browser Shims Types
// =============================================================================

/**
 * Browser shims configuration for client-side bundling
 * Allows replacing server-only modules with browser-compatible alternatives
 */
export type BrowserShimsConfig = {
  /**
   * JSR package shims - replaces @eser/* and jsr: imports with browser-compatible code
   * Key: package specifier (e.g., "@eser/logging")
   * Value: JavaScript code string that provides the browser shim
   */
  jsr?: Record<string, string>;

  /**
   * Node.js builtin shims - replaces node: protocol imports with browser-compatible code
   * Key: node builtin specifier (e.g., "node:process")
   * Value: JavaScript code string that provides the browser shim
   */
  nodeBuiltins?: Record<string, string>;
};

// =============================================================================
// User Config Types
// =============================================================================

/**
 * User-facing configuration options
 * This is what users can specify in laroux.config.ts
 */
export type UserConfig = {
  /** Project source directory (default: "src") */
  srcDir?: string;

  /** Build output directory (default: "dist") */
  distDir?: string;

  /** Public assets directory (default: "public") */
  publicDir?: string;

  /** Log level (default: "info") */
  logLevel?: LogLevel;

  /** Server configuration */
  server?: {
    /** HTTP server port (default: 8000) */
    port?: number;

    /** Enable HMR (default: true in dev) */
    hmr?: boolean;

    /** Custom hostname (default: "localhost") */
    host?: string;

    /** Open browser on start (default: false) */
    open?: boolean;
  };

  /** Build configuration */
  build?: {
    /** Enable minification (default: true) */
    minify?: boolean;

    /** Generate source maps (default: true) */
    sourcemap?: boolean;

    /** Target browsers (default: ["es2022"]) */
    target?: string[];

    /** External dependencies (don't bundle) */
    external?: string[];

    /**
     * Additional server-side external packages.
     * These are merged with the defaults: ["@eser/laroux", "@eser/laroux-server"]
     * Server externals resolve from the app's node_modules at runtime.
     */
    serverExternals?: string[];
  };

  /** Path aliases */
  alias?: Record<string, string>;

  /** Environment variables to expose to client */
  env?: Record<string, string>;

  /** Font configuration */
  fonts?: FontDefinition[];

  /** Image optimization configuration */
  images?: ImageConfig;

  /** Critical CSS extraction configuration */
  criticalCss?: CriticalCssConfig;

  /** Server-Side Rendering configuration */
  ssr?: SSRConfig;

  /** Generate TypeScript .d.ts files for CSS modules */
  cssModuleTypes?: boolean;

  /** Disable auto-injection of @reference directive in CSS modules */
  noCssModuleAutoReference?: boolean;

  /** Browser shims for client-side bundling */
  browserShims?: BrowserShimsConfig;
};

// =============================================================================
// Resolved Config Types (all properties guaranteed)
// =============================================================================

/** Resolved server configuration */
export type ResolvedServerConfig = {
  port: number;
  host: string;
  hmr: boolean;
  open: boolean;
};

/** Resolved build configuration */
export type ResolvedBuildConfig = {
  minify: boolean;
  sourcemap: boolean;
  target: string[];
  external: string[];
  /**
   * Server-side external packages (not bundled into server components).
   * These packages resolve from the app's node_modules at runtime.
   * Default: ["@eser/laroux", "@eser/laroux-server"]
   */
  serverExternals: string[];
};

/** Resolved SSR configuration */
export type ResolvedSSRConfig = {
  mode: SSRMode;
  streamMode: SSRStreamMode;
};

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

/** Resolved critical CSS viewport */
export type ResolvedCriticalCssViewport = {
  width: number;
  height: number;
};

/** Resolved critical CSS configuration */
export type ResolvedCriticalCssConfig = {
  enabled: boolean;
  viewport: ResolvedCriticalCssViewport;
  forceInclude: string[];
  forceExclude: string[];
};

/** Resolved internal endpoints configuration */
export type ResolvedInternalConfig = {
  runtimeBundleEndpoint: string;
  runtimeModuleMapEndpoint: string;
  staticAssetsPrefix: string;
};

/** Resolved mode flags */
export type ResolvedModeConfig = {
  isDev: boolean;
  isBuild: boolean;
  isServe: boolean;
  isWatch: boolean;
};

/**
 * Resolved browser shims configuration (all properties guaranteed)
 */
export type ResolvedBrowserShimsConfig = {
  jsr: Record<string, string>;
  nodeBuiltins: Record<string, string>;
};

/**
 * Internal configuration (computed from UserConfig + CLI + defaults)
 * This is the complete config used by the framework
 *
 * Uses resolved types where all nested properties are non-optional.
 * This eliminates the need for optional chaining when accessing nested config values.
 */
export type AppConfig = {
  /** Project root directory (absolute path) */
  projectRoot: string;

  /** Source directory containing application components (absolute path) */
  srcDir: string;

  /** Distribution directory for built assets (absolute path) */
  distDir: string;

  /** Public assets directory (absolute path) */
  publicDir: string;

  /** Log level for LogTape */
  logLevel: LogLevel;

  /** HTTP server configuration - all properties guaranteed */
  server: ResolvedServerConfig;

  /** Build configuration - all properties guaranteed */
  build: ResolvedBuildConfig;

  /** Path aliases (absolute paths) */
  alias: Record<string, string>;

  /** Environment variables */
  env: Record<string, string>;

  /** Font configuration */
  fonts: FontDefinition[];

  /** Image optimization configuration - all properties guaranteed */
  images: ResolvedImageConfig;

  /** Critical CSS extraction configuration - all properties guaranteed */
  criticalCss: ResolvedCriticalCssConfig;

  /** Server-Side Rendering configuration - all properties guaranteed */
  ssr: ResolvedSSRConfig;

  /** Internal endpoints configuration - all properties guaranteed */
  internal: ResolvedInternalConfig;

  /** CLI mode flags - all properties guaranteed */
  mode: ResolvedModeConfig;

  /** Generate TypeScript .d.ts files for CSS modules */
  cssModuleTypes: boolean;

  /** Disable auto-injection of @reference directive in CSS modules */
  noCssModuleAutoReference: boolean;

  /** Browser shims for client-side bundling - all properties guaranteed */
  browserShims: ResolvedBrowserShimsConfig;
};
