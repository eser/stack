// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Image configuration building utilities
 *
 * @module
 */

import type { ImageAttributes, ImageProps, ParsedImageSrc } from "./types.ts";
import { OBJECT_FIT_CLASSES } from "./presets.ts";

/**
 * Parse image source URL into base path and extension
 *
 * @param src - Image source URL
 * @returns Parsed source with basePath and ext
 */
export function parseImageSrc(src: string): ParsedImageSrc {
  const ext = src.split(".").pop() ?? "";
  const basePath = src.replace(`.${ext}`, "");
  return { basePath, ext };
}

/**
 * Build image attributes from props
 *
 * @param props - Image component props
 * @returns Framework-agnostic image attributes
 */
export function buildImageAttributes(props: ImageProps): ImageAttributes {
  const {
    alt,
    width,
    height,
    className = "",
    priority = false,
    objectFit = "cover",
    sizes,
    srcSet,
  } = props;

  const objectFitClass = OBJECT_FIT_CLASSES[objectFit];
  const combinedClassName = `${objectFitClass} ${className}`.trim();

  return {
    alt,
    width,
    height,
    className: combinedClassName || undefined,
    loading: priority ? "eager" : "lazy",
    decoding: "async",
    fetchPriority: priority ? "high" : "auto",
    sizes,
    srcSet,
  };
}

/**
 * Build error handler script for fallback images
 *
 * @param fallback - Fallback image URL
 * @returns Inline script for onerror attribute
 */
export function buildFallbackHandler(fallback: string): string {
  return `(function(e) { if (e.target.src !== '${fallback}') e.target.src = '${fallback}'; })(event)`;
}

/**
 * Combine class names, filtering out empty strings
 *
 * @param classNames - Array of class names
 * @returns Combined class string
 */
export function combineClassNames(
  ...classNames: (string | undefined)[]
): string {
  return classNames.filter(Boolean).join(" ").trim();
}
