// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Image configuration building utilities
 *
 * @module
 */

import type { ImageAttributes, ImageProps, ParsedImageSrc } from "./types.ts";
import * as presets from "./presets.ts";

/**
 * Parse image source URL into base path and extension
 *
 * The extension is what follows the last dot of the file name, the last path
 * segment. A dot in the host or a directory is not an extension, so a source
 * whose file name has no dot gets `ext: ""` and the whole source as its base
 * path. A query or fragment after the extension stays with it
 * (`"photo.jpg?v=3"` gives `ext: "jpg?v=3"`).
 *
 * @param src - Image source URL
 * @returns Parsed source with basePath and ext
 */
export function parseImageSrc(src: string): ParsedImageSrc {
  const queryStart = src.search(/[?#]/);
  const pathEnd = queryStart === -1 ? src.length : queryStart;
  const fileNameStart = src.lastIndexOf("/", pathEnd - 1) + 1;
  const dot = src.lastIndexOf(".", pathEnd - 1);

  if (dot < fileNameStart) {
    return { basePath: src, ext: "" };
  }

  return { basePath: src.slice(0, dot), ext: src.slice(dot + 1) };
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

  const objectFitClass = presets.OBJECT_FIT_CLASSES[objectFit];
  const combinedClassName = `${objectFitClass} ${className}`.trim();

  return {
    alt,
    width,
    height,
    className: combinedClassName === "" ? undefined : combinedClassName,
    loading: priority ? "eager" : "lazy",
    decoding: "async",
    fetchPriority: priority ? "high" : "auto",
    sizes,
    srcSet,
  };
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
