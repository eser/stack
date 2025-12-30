// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CSS processing utilities for bundler.
 *
 * Provides a complete CSS processing pipeline including:
 * - Tailwind CSS processing via @tailwindcss/node (pluggable)
 * - Lightning CSS for advanced optimization
 * - CSS Modules with scoped styling
 * - Google Fonts optimization for self-hosting
 *
 * @module
 *
 * @example
 * ```ts
 * import {
 *   createTailwindRoot,
 *   processCssModule,
 *   optimizeGoogleFonts,
 * } from "@eser/bundler/css";
 *
 * // Process CSS Module with Tailwind @apply support
 * const tailwind = createTailwindRoot({ base: "." });
 * const result = await processCssModule("src/Button.module.css", {
 *   tailwind,
 *   generateDts: true,
 * });
 * console.log(result.exports); // { button: "button_abc123" }
 * tailwind.dispose();
 *
 * // Process CSS Module without Tailwind (pure Lightning CSS)
 * const plainResult = await processCssModule("src/Card.module.css", {
 *   generateDts: true,
 * });
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
  TailwindCompileResult,
  TailwindRoot,
} from "./types.ts";

export { DEFAULT_BROWSER_TARGETS } from "./types.ts";

// Tailwind Plugin (@tailwindcss/node-based API)
export {
  createTailwindRoot,
  hasTailwindDirectives,
  TailwindFeatures,
  type TailwindPluginOptions,
} from "./tailwind-plugin.ts";

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
