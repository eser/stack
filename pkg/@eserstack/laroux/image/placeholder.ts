// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Placeholder style utilities
 *
 * @module
 */

import type { PlaceholderStyles, PlaceholderType } from "./types.ts";

/**
 * Build placeholder styles for blur effect
 *
 * @param placeholder - Placeholder type
 * @param blurDataURL - Base64 encoded blur image data URL
 * @returns Placeholder styles or undefined if not applicable
 */
export function buildPlaceholderStyles(
  placeholder?: PlaceholderType,
  blurDataURL?: string,
): PlaceholderStyles | undefined {
  if (placeholder !== "blur" || !blurDataURL) {
    return undefined;
  }

  return {
    backgroundImage: `url(${blurDataURL})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

/**
 * Check if placeholder should be shown
 *
 * @param placeholder - Placeholder type
 * @param blurDataURL - Blur data URL
 * @returns True if blur placeholder should be shown
 */
export function shouldShowPlaceholder(
  placeholder?: PlaceholderType,
  blurDataURL?: string,
): boolean {
  return placeholder === "blur" && Boolean(blurDataURL);
}
