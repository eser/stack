// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * CSS Plugin Types
 * Defines the interface for pluggable CSS processors (Tailwind, UnoCSS, etc.)
 */

export type CssPluginContext = {
  /** Project root directory */
  projectRoot: string;
  /** Path to the CSS file being processed */
  cssPath: string;
  /** Whether this is a CSS module (.module.css) */
  isModule: boolean;
};

/**
 * Result of critical CSS extraction
 */
export type CriticalCssResult = {
  /** Critical CSS to inline in <head> */
  critical: string;
  /** Deferred CSS to load asynchronously */
  deferred: string;
  /** Statistics about extraction */
  stats?: {
    /** Original CSS size in bytes */
    originalSize: number;
    /** Critical CSS size in bytes */
    criticalSize: number;
    /** Deferred CSS size in bytes */
    deferredSize: number;
  };
};

/**
 * Result of universal CSS extraction
 */
export type UniversalCssResult = {
  /** The generated universal CSS */
  css: string;
  /** CSS variables extracted from theme (if applicable) */
  themeVariables?: Record<string, string>;
};

export type CssPlugin = {
  /** Plugin name for logging/debugging */
  name: string;

  /**
   * Pre-process CSS before compilation
   * Use this to expand framework-specific directives (e.g., @apply for CSS Modules)
   */
  preprocess?: (
    css: string,
    context: CssPluginContext,
  ) => Promise<string> | string;

  /**
   * Compile CSS with framework-specific logic
   * This replaces the default Lightning CSS processing
   * For Tailwind: CLI handles scanning + compilation + minification
   */
  compile?: (css: string, context: CssPluginContext) => Promise<string>;

  /**
   * Check if this plugin should handle the given CSS file
   * Return false to skip this file (use default Lightning CSS processing)
   */
  shouldProcess?: (css: string, context: CssPluginContext) => boolean;

  /**
   * Extract critical page-specific CSS from compiled CSS based on HTML content
   * Returns critical CSS for inlining and deferred CSS for async loading
   */
  extractCriticalCss?: (
    compiledCss: string,
    html: string,
    options?: {
      forceInclude?: (string | RegExp)[];
      forceExclude?: (string | RegExp)[];
    },
  ) => CriticalCssResult;

  /**
   * Extract universal/base CSS from compiled CSS
   * Returns minimal CSS needed for initial render (e.g., theme variables, base styles)
   */
  extractUniversalCss?: (compiledCss: string) => UniversalCssResult;
};

export type CssPluginOptions = {
  /** Path to global CSS file (for @reference injection) */
  globalCssPath?: string;
  /** Whether to auto-inject @reference directive in CSS modules */
  autoInjectReference?: boolean;
};
