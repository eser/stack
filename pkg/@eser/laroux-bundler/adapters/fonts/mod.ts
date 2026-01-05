// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Fonts Adapter
 * Font optimization and utilities
 */

export {
  type FontFile,
  type FontOptimizationResult,
  optimizeGoogleFonts,
  optimizeMultipleGoogleFonts,
} from "./font-optimizer.ts";

export {
  type FontDefinition,
  type FontDisplay,
  type FontStyle,
  type FontWeight,
  generateFontVariables,
  generateGoogleFontsUrl,
  getFontFamilies,
  getFontUrls,
} from "./index.ts";
