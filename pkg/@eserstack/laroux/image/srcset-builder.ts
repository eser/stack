// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Srcset building utilities
 *
 * @module
 */

import { DEFAULT_WIDTHS } from "./presets.ts";

/**
 * Infer srcset from src by generating responsive variants
 * Assumes optimized images follow the pattern: name-{width}w.{format}
 *
 * @param src - Original image source URL
 * @param widths - Array of widths to generate srcset entries for
 * @returns Generated srcset string
 */
export function inferSrcSet(
  src: string,
  widths: readonly number[] = DEFAULT_WIDTHS,
): string {
  const ext = src.split(".").pop() ?? "";
  const basePath = src.replace(`.${ext}`, "");

  return widths.map((w) => `${basePath}-${w}w.${ext} ${w}w`).join(", ");
}

/**
 * Replace file extension in a srcset string
 *
 * @param srcSet - Original srcset string
 * @param originalExt - Extension to replace (without dot)
 * @param newExt - New extension (without dot)
 * @returns Srcset string with replaced extension
 */
export function replaceSrcSetExtension(
  srcSet: string,
  originalExt: string,
  newExt: string,
): string {
  return srcSet.replace(new RegExp(`\\.${originalExt}`, "g"), `.${newExt}`);
}

/**
 * Build srcset for a specific format
 *
 * @param basePath - Base path without extension
 * @param format - Target format (e.g., 'webp', 'avif')
 * @param widths - Array of widths to generate
 * @returns Srcset string for the format
 */
export function buildFormatSrcSet(
  basePath: string,
  format: string,
  widths: readonly number[] = DEFAULT_WIDTHS,
): string {
  return widths.map((w) => `${basePath}-${w}w.${format} ${w}w`).join(", ");
}
