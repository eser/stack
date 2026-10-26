// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Image presets and constants
 *
 * @module
 */

/**
 * CSS class mappings for object-fit values
 */
export const OBJECT_FIT_CLASSES = {
  cover: "object-cover",
  contain: "object-contain",
  fill: "object-fill",
  none: "object-none",
  "scale-down": "object-scale-down",
} as const;

/**
 * CSS class mappings for aspect ratios
 */
export const ASPECT_RATIO_CLASSES = {
  "16/9": "aspect-video",
  "4/3": "aspect-4/3",
  "1/1": "aspect-square",
  "3/2": "aspect-3/2",
} as const;

/**
 * Common responsive sizes attribute presets
 */
export const ImageSizes = {
  /** Full width on all screens */
  fullWidth: "100vw",
  /** Half width on desktop, full on mobile */
  halfWidth: "(max-width: 768px) 100vw, 50vw",
  /** Third width on desktop, half on tablet, full on mobile */
  thirdWidth: "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  /** Card image (fixed max width) */
  card: "(max-width: 640px) 100vw, 400px",
  /** Thumbnail */
  thumbnail: "150px",
  /** Hero image */
  hero: "100vw",
} as const;

/**
 * Default responsive image widths for srcset generation
 */
export const DEFAULT_WIDTHS = [640, 768, 1024, 1280, 1920] as const;

/**
 * Default responsive sizes attribute
 */
export const DEFAULT_SIZES =
  "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";
