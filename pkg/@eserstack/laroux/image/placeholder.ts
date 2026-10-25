// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Placeholder style utilities
 *
 * @module
 */

import type { PlaceholderStyles, PlaceholderType } from "./types.ts";

// A quote, a backslash or a line break would end or break the quoted CSS
// string the data URL goes into.
const CSS_STRING_BREAKING_CHARACTERS = /["\\\n\r\f]/g;

/**
 * Wrap a URL in a quoted CSS `url()`, each character that would break the
 * string written as a CSS hex escape.
 */
const toCssUrl = (url: string): string => {
  const escaped = url.replace(
    CSS_STRING_BREAKING_CHARACTERS,
    (character) => `\\${character.charCodeAt(0).toString(16)} `,
  );

  return `url("${escaped}")`;
};

/**
 * Build placeholder styles for blur effect
 *
 * @param placeholder - Placeholder type
 * @param blurDataURL - Base64 encoded blur image data URL
 * @returns Placeholder styles, or undefined unless the placeholder is "blur"
 *   and the data URL is not empty
 */
export function buildPlaceholderStyles(
  placeholder?: PlaceholderType,
  blurDataURL?: string,
): PlaceholderStyles | undefined {
  if (
    placeholder !== "blur" ||
    blurDataURL === undefined ||
    blurDataURL === ""
  ) {
    return undefined;
  }

  return {
    backgroundImage: toCssUrl(blurDataURL),
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

/**
 * Check if placeholder should be shown
 *
 * @param placeholder - Placeholder type
 * @param blurDataURL - Blur data URL
 * @returns True if the placeholder is "blur" and the data URL is not empty
 */
export function shouldShowPlaceholder(
  placeholder?: PlaceholderType,
  blurDataURL?: string,
): boolean {
  return (
    placeholder === "blur" && blurDataURL !== undefined && blurDataURL !== ""
  );
}
