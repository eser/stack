// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Font Optimizer Port
 *
 * Self-hosts the fonts an app configures: downloads the font files and
 * returns the @font-face rules and preload hints that point at them. The
 * Google Fonts adapter (adapters/fonts) implements it.
 */

import type { FontDefinition } from "@eserstack/laroux/config";

/** Where a {@link FontOptimizer} writes the font files. */
export type FontOptimizationOptions = {
  /** Directory the font files are written to */
  readonly outputDir: string;
  /** URL path the files are served under, such as "/fonts" */
  readonly publicPath: string;
};

/** Self-hosted fonts, as the build writes them next to the client bundle. */
export type OptimizedFonts = {
  /** @font-face rules that load the downloaded files */
  readonly fontFaceCss: string;
  /** HTML preload tags for the fonts the first render needs */
  readonly preloadHints: readonly string[];
  /** Number of font files written */
  readonly fileCount: number;
  /** Total size of the font files in bytes */
  readonly totalSize: number;
};

/** Downloads the configured fonts so the app serves them itself. */
export type FontOptimizer = {
  /** Optimizer name for logs */
  readonly name: string;
  /**
   * Download the fonts and return the CSS and preload hints for them.
   *
   * @param fonts - The fonts from the app config
   * @param options - Where the files go and the URL path they are served under
   * @returns The optimized fonts, or null when none of the fonts is one this
   *   optimizer handles
   */
  optimize: (
    fonts: readonly FontDefinition[],
    options: FontOptimizationOptions,
  ) => Promise<OptimizedFonts | null>;
};

/**
 * Font optimizer for builds that pass none: it handles no font, so the build
 * writes no font files or @font-face rules, and pages use whatever fonts the
 * app's own CSS loads.
 */
export const noopFontOptimizer: FontOptimizer = {
  name: "noop",
  optimize: () => Promise.resolve(null),
};
