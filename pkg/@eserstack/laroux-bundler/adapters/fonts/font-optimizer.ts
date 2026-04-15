// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Font Optimizer
 * Re-exports @eserstack/bundler/css font optimization utilities with logging.
 */

import * as logging from "@eserstack/logging";
import {
  extractFontFamilies,
  type FontFile,
  type FontOptimizationResult,
  optimizeGoogleFonts as eserOptimizeGoogleFonts,
  optimizeMultipleGoogleFonts as eserOptimizeMultipleGoogleFonts,
} from "@eserstack/bundler/css";

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
  const families = extractFontFamilies(fontUrl);
  fontLogger.info(
    `🔤 Optimizing Google Fonts: ${families.join(", ") || "unknown"}`,
  );
  fontLogger.debug(`   URL: ${fontUrl}`);
  fontLogger.debug(`   Output: ${outputDir}`);
  fontLogger.debug(`   Public path: ${publicPath}`);

  const result = await eserOptimizeGoogleFonts(fontUrl, {
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

  const result = await eserOptimizeMultipleGoogleFonts(fontUrls, {
    outputDir,
    publicPath,
    maxPreloadFonts: 2,
  });

  fontLogger.info(
    `   ✅ Optimized ${result.files.length} total font file(s)`,
  );
  fontLogger.debug(
    `   Total size: ${(result.totalSize / 1024).toFixed(2)} KB`,
  );

  return result;
}
