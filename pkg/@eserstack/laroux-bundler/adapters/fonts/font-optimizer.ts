// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Font Optimizer
 * Re-exports @eserstack/bundler/css font optimization utilities with logging.
 */

import * as logging from "@eserstack/logging";
import * as css from "@eserstack/bundler/css";
import type { FontFile, FontOptimizationResult } from "@eserstack/bundler/css";
import type {
  FontOptimizationOptions,
  FontOptimizer,
  OptimizedFonts,
} from "../../domain/font-optimizer.ts";
import type { FontDefinition } from "../../types.ts";
import * as fontUrls from "./index.ts";

const fontLogger = logging.logger.getLogger([
  "laroux-bundler",
  "font-optimizer",
]);

// Re-export types
export type { FontFile, FontOptimizationResult };

/**
 * Optimizes Google Fonts for self-hosting
 *
 * @param fontUrl - Google Fonts URL (e.g., "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500")
 * @param outputDir - Directory to save font files (e.g., "dist/fonts")
 * @param publicPath - Public path for font URLs (e.g., "/fonts")
 * @returns Font optimization result with CSS, preload hints, and metadata
 */
export async function optimizeGoogleFonts(
  fontUrl: string,
  outputDir: string,
  publicPath = "/fonts",
): Promise<FontOptimizationResult> {
  const families = css.extractFontFamilies(fontUrl);
  const familyList = families.length > 0 ? families.join(", ") : "unknown";
  fontLogger.info(`🔤 Optimizing Google Fonts: ${familyList}`);
  fontLogger.debug(`   URL: ${fontUrl}`);
  fontLogger.debug(`   Output: ${outputDir}`);
  fontLogger.debug(`   Public path: ${publicPath}`);

  const result = await css.optimizeGoogleFonts(fontUrl, {
    outputDir,
    publicPath,
    maxPreloadFonts: 2,
  });

  fontLogger.info(`   ✅ Downloaded ${result.files.length} font file(s)`);
  fontLogger.debug(`   Total size: ${(result.totalSize / 1024).toFixed(2)} KB`);
  fontLogger.debug(
    `   Generated ${result.preloadHints.length} preload hint(s) for critical fonts`,
  );

  return result;
}

/**
 * Optimizes multiple Google Fonts URLs
 * Useful when you have separate font imports
 */
export async function optimizeMultipleGoogleFonts(
  fontUrls: string[],
  outputDir: string,
  publicPath = "/fonts",
): Promise<FontOptimizationResult> {
  fontLogger.info(`🔤 Optimizing ${fontUrls.length} Google Fonts URL(s)`);

  const result = await css.optimizeMultipleGoogleFonts(fontUrls, {
    outputDir,
    publicPath,
    maxPreloadFonts: 2,
  });

  fontLogger.info(`   ✅ Optimized ${result.files.length} total font file(s)`);
  fontLogger.debug(`   Total size: ${(result.totalSize / 1024).toFixed(2)} KB`);

  return result;
}

/**
 * Font optimizer that self-hosts Google Fonts: it downloads every font whose
 * provider is "google" into the output directory and returns the @font-face
 * rules and preload hints for them. Fonts with another provider are left to
 * the app. Pass it to the build as `fontOptimizer`.
 */
export const googleFontOptimizer: FontOptimizer = {
  name: "google-fonts",
  optimize: async (
    fonts: readonly FontDefinition[],
    options: FontOptimizationOptions,
  ): Promise<OptimizedFonts | null> => {
    const [fontUrl] = fontUrls.getFontUrls(fonts);
    if (fontUrl === undefined) {
      return null;
    }

    const result = await optimizeGoogleFonts(
      fontUrl,
      options.outputDir,
      options.publicPath,
    );

    return {
      fontFaceCss: result.fontFaceCSS,
      preloadHints: result.preloadHints,
      fileCount: result.files.length,
      totalSize: result.totalSize,
    };
  },
};
