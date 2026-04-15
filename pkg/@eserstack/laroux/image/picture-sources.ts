// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Picture element source building utilities
 *
 * @module
 */

import type { ImageFormat, PictureSource } from "./types.ts";
import { inferSrcSet, replaceSrcSetExtension } from "./srcset-builder.ts";

/**
 * Build picture source elements configuration
 *
 * @param basePath - Base path without extension
 * @param originalExt - Original file extension
 * @param formats - Array of formats to generate sources for
 * @param srcSet - Optional custom srcset (will be adapted for each format)
 * @param sizes - Optional sizes attribute
 * @returns Array of source configurations for picture element
 */
export function buildPictureSources(
  basePath: string,
  originalExt: string,
  formats: ImageFormat[],
  srcSet?: string,
  sizes?: string,
): PictureSource[] {
  const sources: PictureSource[] = [];

  // Add AVIF source if requested (most efficient, should come first)
  if (formats.includes("avif")) {
    sources.push({
      type: "image/avif",
      srcSet: srcSet !== undefined
        ? replaceSrcSetExtension(srcSet, originalExt, "avif")
        : inferSrcSet(`${basePath}.avif`),
      sizes,
    });
  }

  // Add WebP source if requested
  if (formats.includes("webp")) {
    sources.push({
      type: "image/webp",
      srcSet: srcSet !== undefined
        ? replaceSrcSetExtension(srcSet, originalExt, "webp")
        : inferSrcSet(`${basePath}.webp`),
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
export function shouldUsePictureElement(formats?: ImageFormat[]): boolean {
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
