// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Branded Handle value object.
 * Represents a social media @username, stored without the leading "@".
 * Platform-agnostic: works for Twitter handles and Bluesky handles alike.
 */

declare const handleBrand: unique symbol;

/** Opaque string type representing a social media username (without "@"). */
export type Handle = string & { readonly [handleBrand]: typeof handleBrand };

/**
 * Constructs a Handle from a raw string.
 * Strips the leading "@" if present and normalises to lowercase.
 */
export const toHandle = (value: string): Handle => {
  const normalized = value.startsWith("@") ? value.slice(1) : value;

  return normalized.toLowerCase() as Handle;
};
