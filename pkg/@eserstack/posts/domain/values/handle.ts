// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Branded Handle value object.
 * Represents a social media @username, stored without the leading "@".
 * Platform-agnostic: works for Twitter handles and Bluesky handles alike.
 *
 * @module
 */

/**
 * Opaque string type representing a social media username (without "@").
 * The `__brand` property exists only in the type system: it keeps a plain
 * string or a PostId from passing as a Handle, and no value carries it at
 * runtime. Build one with `toHandle`.
 */
export type Handle = string & { readonly __brand: "Handle" };

/**
 * Constructs a Handle from a raw string.
 * Strips the leading "@" if present and normalises to lowercase.
 */
export const toHandle = (value: string): Handle => {
  const normalized = value.startsWith("@") ? value.slice(1) : value;

  return normalized.toLowerCase() as Handle;
};
