// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Type definitions for CSS processing utilities.
 *
 * @module
 */

/**
 * Options for processing CSS with Tailwind.
 */
export interface TailwindProcessOptions {
  /** Input CSS file path. */
  readonly input: string;
  /** Output CSS file path. */
  readonly output: string;
  /** Whether to minify the output. */
  readonly minify?: boolean;
  /** Project root directory for Tailwind config. */
  readonly projectRoot: string;
  /** Tailwind CSS version to use. */
  readonly version?: string;
}

/**
 * Options for Tailwind watch mode.
 */
export interface TailwindWatchOptions extends TailwindProcessOptions {
  /** Callback when CSS changes. */
  readonly onChange?: (output: string) => void | Promise<void>;
}

/**
 * Browser targeting configuration for Lightning CSS.
 */
export interface BrowserTargets {
  /** Chrome version (major << 16). */
  readonly chrome?: number;
  /** Firefox version (major << 16). */
  readonly firefox?: number;
  /** Safari version (major << 16). */
  readonly safari?: number;
  /** Edge version (major << 16). */
  readonly edge?: number;
}

/**
 * Options for Lightning CSS transformation.
 */
export interface LightningCssOptions {
  /** Input file path (for source maps). */
  readonly filename?: string;
  /** Whether to minify output. */
  readonly minify?: boolean;
  /** Browser targets for compatibility. */
  readonly targets?: BrowserTargets;
  /** Enable CSS Modules transformation. */
  readonly cssModules?: boolean;
  /** Enable CSS nesting (drafts.nesting). */
  readonly nesting?: boolean;
  /** Unused symbols to remove. */
  readonly unusedSymbols?: readonly string[];
}

/**
 * Result of Lightning CSS transformation.
 */
export interface LightningCssResult {
  /** Transformed CSS code. */
  readonly code: string;
  /** Source map (if generated). */
  readonly map?: string;
  /** CSS Modules exports (if cssModules enabled). */
  readonly exports?: Readonly<Record<string, CssModuleExportData>>;
}

/**
 * CSS Module export data from Lightning CSS.
 */
export interface CssModuleExportData {
  /** Scoped class name. */
  readonly name: string;
  /** Composed class names (from composes). */
  readonly composes?: readonly CssModuleCompose[];
}

/**
 * CSS Module composition reference.
 */
export interface CssModuleCompose {
  /** Composed class name. */
  readonly name: string;
  /** Whether from external file. */
  readonly from?: string;
}

/**
 * Result of CSS Module processing.
 */
export interface CssModuleResult {
  /** Processed CSS code. */
  readonly code: string;
  /** Map of original class names to scoped class names. */
  readonly exports: Readonly<Record<string, string>>;
  /** Optional TypeScript .d.ts content. */
  readonly dts?: string;
}

/**
 * Options for CSS Module processing.
 */
export interface CssModuleOptions {
  /** Whether to generate TypeScript .d.ts file. */
  readonly generateDts?: boolean;
  /** Project root directory for Tailwind processing. */
  readonly projectRoot?: string;
  /** Whether to auto-inject @reference directive for Tailwind. */
  readonly autoInjectReference?: boolean;
  /** Path to global CSS file for @reference. */
  readonly globalCssPath?: string;
  /** Whether to minify output. */
  readonly minify?: boolean;
  /** Browser targets. */
  readonly targets?: BrowserTargets;
}

/**
 * Font file information.
 */
export interface FontFile {
  /** Original CDN URL. */
  readonly url: string;
  /** Local file path. */
  readonly localPath: string;
  /** Filename. */
  readonly filename: string;
  /** Font format (woff2, woff, truetype). */
  readonly format: string;
}

/**
 * Result of font optimization.
 */
export interface FontOptimizationResult {
  /** Rewritten @font-face CSS declarations. */
  readonly fontFaceCSS: string;
  /** HTML preload hints for critical fonts. */
  readonly preloadHints: readonly string[];
  /** Downloaded font files. */
  readonly files: readonly FontFile[];
  /** Total size in bytes. */
  readonly totalSize: number;
}

/**
 * Options for Google Fonts optimization.
 */
export interface FontOptimizationOptions {
  /** Directory to save font files. */
  readonly outputDir: string;
  /** Public path for font URLs (default: "/fonts"). */
  readonly publicPath?: string;
  /** Maximum fonts to preload (default: 2). */
  readonly maxPreloadFonts?: number;
}

/**
 * CSS processing pipeline result.
 */
export interface CssPipelineResult {
  /** Main CSS output. */
  readonly css: string;
  /** CSS source map. */
  readonly map?: string;
  /** CSS Modules exports. */
  readonly moduleExports?: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
  /** Font optimization result. */
  readonly fonts?: FontOptimizationResult;
  /** Total processing time in ms. */
  readonly processingTime: number;
}

/**
 * Default browser targets (Chrome 90+, Firefox 88+, Safari 14+).
 */
export const DEFAULT_BROWSER_TARGETS: BrowserTargets = {
  chrome: 90 << 16,
  firefox: 88 << 16,
  safari: 14 << 16,
};
