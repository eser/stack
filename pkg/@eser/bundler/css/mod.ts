// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CSS processing utilities for bundler.
 *
 * Provides a complete CSS processing pipeline including:
 * - Tailwind CSS processing with standalone binary
 * - Lightning CSS for advanced optimization
 * - CSS Modules with scoped styling
 * - Google Fonts optimization for self-hosting
 *
 * @module
 *
 * @example
 * ```ts
 * import {
 *   processTailwindCss,
 *   processCssModule,
 *   optimizeGoogleFonts,
 * } from "@eser/bundler/css";
 *
 * // Process global CSS with Tailwind
 * await processTailwindCss({
 *   input: "src/styles/global.css",
 *   output: "dist/styles.css",
 *   projectRoot: ".",
 *   minify: true,
 * });
 *
 * // Process CSS Module
 * const result = await processCssModule("src/Button.module.css", {
 *   generateDts: true,
 *   projectRoot: ".",
 * });
 * console.log(result.exports); // { button: "button_abc123" }
 *
 * // Optimize Google Fonts
 * const fonts = await optimizeGoogleFonts(
 *   "https://fonts.googleapis.com/css2?family=Roboto",
 *   { outputDir: "dist/fonts" },
 * );
 * ```
 */

// Types
export type {
  BrowserTargets,
  CssModuleOptions,
  CssModuleResult,
  CssPipelineResult,
  FontFile,
  FontOptimizationOptions,
  FontOptimizationResult,
  LightningCssOptions,
  LightningCssResult,
  TailwindProcessOptions,
  TailwindWatchOptions,
} from "./types.ts";

export { DEFAULT_BROWSER_TARGETS } from "./types.ts";

// Tailwind
export {
  DEFAULT_TAILWIND_VERSION,
  ensureTailwindBinary,
  expandTailwindApply,
  getTailwindBinaryName,
  getTailwindDownloadUrl,
  processTailwindCss,
  watchTailwindCss,
} from "./tailwind.ts";

// Lightning CSS
export {
  BrowserTargetPresets,
  browserVersion,
  minifyCss,
  transformCssFile,
  transformCssModules,
  transformWithLightningCss,
} from "./lightning.ts";

// CSS Modules
export {
  buildCssModules,
  createCssModulesRuntime,
  findCssModules,
  generateTypeScriptDefinition,
  processCssModule,
  processCssModules,
  saveCssModuleOutputs,
} from "./modules.ts";

// Fonts
export {
  downloadFont,
  downloadFonts,
  extractFontFamilies,
  extractFontUrls,
  fetchGoogleFontsCss,
  generateInlineFontFaceCss,
  generatePreloadHints,
  optimizeGoogleFonts,
  optimizeMultipleGoogleFonts,
  rewriteFontFaceCss,
} from "./fonts.ts";
