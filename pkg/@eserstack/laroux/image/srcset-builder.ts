// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Srcset building utilities
 *
 * @module
 */

import * as imageConfig from "./image-config.ts";
import * as presets from "./presets.ts";

// Characters with a meaning in a regular expression, escaped to match an
// extension literally.
const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\/]/g;

/**
 * Infer srcset from src by generating responsive variants
 * Assumes optimized images follow the pattern: name-{width}w.{format}
 *
 * The width goes before the extension that {@link imageConfig.parseImageSrc}
 * finds, or at the end of a source without one (`name-{width}w`).
 *
 * @param src - Original image source URL
 * @param widths - Array of widths to generate srcset entries for
 * @returns Generated srcset string
 */
export function inferSrcSet(
  src: string,
  widths: readonly number[] = presets.DEFAULT_WIDTHS,
): string {
  const { basePath, ext } = imageConfig.parseImageSrc(src);
  const suffix = ext === "" ? "" : `.${ext}`;

  return widths.map((w) => `${basePath}-${w}w${suffix} ${w}w`).join(", ");
}

/**
 * Replace file extension in a srcset string
 *
 * Only an extension that ends a URL is replaced: one followed by a descriptor,
 * the next candidate, a query, a fragment or the end of the srcset. The same
 * letters in a host or a directory stay. An empty `originalExt` means the
 * source has no extension, so the srcset comes back unchanged.
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
  if (originalExt === "") {
    return srcSet;
  }

  const escaped = originalExt.replace(REGEXP_SPECIAL_CHARACTERS, "\\$&");
  const extension = new RegExp(`\\.${escaped}(?=[\\s,?#]|$)`, "g");

  // A function keeps "$" in newExt from being read as a replacement pattern.
  return srcSet.replace(extension, () => `.${newExt}`);
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
  widths: readonly number[] = presets.DEFAULT_WIDTHS,
): string {
  return widths.map((w) => `${basePath}-${w}w.${format} ${w}w`).join(", ");
}
