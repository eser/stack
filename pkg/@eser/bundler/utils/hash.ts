// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Content hashing utilities for bundle outputs.
 *
 * @module
 */

import { encodeHex } from "@std/encoding/hex";

/**
 * Hash algorithm options.
 */
export type HashAlgorithm = "SHA-256" | "SHA-1" | "MD5";

/**
 * Compute a content hash.
 *
 * @param content - Content to hash
 * @param algorithm - Hash algorithm (default: SHA-256)
 * @param length - Hash output length in hex chars (default: 16)
 * @returns Hex-encoded hash
 */
export async function computeHash(
  content: Uint8Array,
  algorithm: HashAlgorithm = "SHA-256",
  length = 16,
): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    algorithm,
    content as BufferSource,
  );
  return encodeHex(new Uint8Array(hashBuffer)).slice(0, length);
}

/**
 * Compute a hash for string content.
 *
 * @param content - String content to hash
 * @param algorithm - Hash algorithm (default: SHA-256)
 * @param length - Hash output length in hex chars (default: 16)
 * @returns Hex-encoded hash
 */
export function computeStringHash(
  content: string,
  algorithm: HashAlgorithm = "SHA-256",
  length = 16,
): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  return computeHash(encoded, algorithm, length);
}

/**
 * Compute a hash for multiple pieces of content.
 *
 * @param contents - Array of content to hash together
 * @param algorithm - Hash algorithm (default: SHA-256)
 * @param length - Hash output length in hex chars (default: 16)
 * @returns Hex-encoded hash
 */
export function computeCombinedHash(
  contents: readonly Uint8Array[],
  algorithm: HashAlgorithm = "SHA-256",
  length = 16,
): Promise<string> {
  const totalLength = contents.reduce((sum, c) => sum + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const content of contents) {
    combined.set(content, offset);
    offset += content.length;
  }
  return computeHash(combined, algorithm, length);
}
