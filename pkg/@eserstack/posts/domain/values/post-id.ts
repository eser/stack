// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Branded PostId value object.
 * Prevents accidental substitution of plain strings for post identifiers.
 * Works across platforms: Twitter numeric IDs, Bluesky AT-URIs, etc.
 */

declare const postIdBrand: unique symbol;

/** Opaque string type representing a social post identifier. */
export type PostId = string & { readonly [postIdBrand]: typeof postIdBrand };

/**
 * Constructs a PostId from a raw string.
 *
 * Pure cast — performs no trimming, normalisation, or validation.
 * Callers (mappers, adapters) are responsible for sanitising the input
 * before calling this function.  The contract is intentional: the same
 * raw string in ↔ the same PostId out, every time.
 */
export const toPostId = (value: string): PostId => value as PostId;
