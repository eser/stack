// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Picture element source building utilities
 *
 * @module
 */

import type {
  ImageFormat,
  PictureSource,
  PictureSourcesOptions,
} from "./types.ts";
import * as srcsetBuilder from "./srcset-builder.ts";

/**
 * Build picture source elements configuration
 *
 * @param options - The image path, its formats and the optional srcset and sizes
 * @returns Array of source configurations for picture element
 *
 * @example
 * ```typescript
 * import * as laroux from "@eserstack/laroux";
 *
 * const sources = laroux.buildPictureSources({
 *   ...laroux.parseImageSrc("/images/photo.jpg"),
 *   formats: ["avif", "webp"],
 *   sizes: "100vw",
 * });
 * // [{ type: "image/avif", srcSet: "/images/photo-640w.avif 640w, ...", sizes: "100vw" }, ...]
 * ```
 */
export function buildPictureSources(
  options: PictureSourcesOptions,
): PictureSource[] {
  const { basePath, ext, formats, srcSet, sizes } = options;
  const sources: PictureSource[] = [];

  // Add AVIF source if requested (most efficient, should come first)
  if (formats.includes("avif")) {
    sources.push({
      type: "image/avif",
      srcSet: srcSet !== undefined
        ? srcsetBuilder.replaceSrcSetExtension(srcSet, ext, "avif")
        : srcsetBuilder.inferSrcSet(`${basePath}.avif`),
      sizes,
    });
  }

  // Add WebP source if requested
  if (formats.includes("webp")) {
    sources.push({
      type: "image/webp",
      srcSet: srcSet !== undefined
        ? srcsetBuilder.replaceSrcSetExtension(srcSet, ext, "webp")
        : srcsetBuilder.inferSrcSet(`${basePath}.webp`),
      sizes,
    });
  }

  return sources;
}

/**
 * Check if picture element should be used
 *
 * @param formats - Array of formats
 * @returns True if formats array has entries
 */
export function shouldUsePictureElement(
  formats?: readonly ImageFormat[],
): boolean {
  return formats !== undefined && formats.length > 0;
}

/**
 * Get MIME type for image format
 *
 * @param format - Image format
 * @returns MIME type string
 */
export function getFormatMimeType(format: ImageFormat): string {
  const mimeTypes: Record<ImageFormat, string> = {
    webp: "image/webp",
    avif: "image/avif",
  };
  return mimeTypes[format];
}
