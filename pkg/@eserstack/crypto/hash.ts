// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Content hashing utilities using Web Crypto API.
 *
 * Provides functions for computing cryptographic hashes of binary and string content.
 *
 * @module
 */

import * as hex from "@std/encoding/hex";

/**
 * Hash algorithm options supported by Web Crypto API.
 */
export type HashAlgorithm = "SHA-256" | "SHA-384" | "SHA-512" | "SHA-1";

/**
 * Compute a content hash.
 *
 * @param content - Content to hash
 * @param algorithm - Hash algorithm (default: SHA-256)
 * @param length - Hash output length in hex chars (default: 16)
 * @returns Hex-encoded hash
 *
 * @example
 * ```ts
 * const hash = await computeHash(new Uint8Array([1, 2, 3]));
 * console.log(hash); // "039058c6f2c0cb49"
 * ```
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
  return hex.encodeHex(new Uint8Array(hashBuffer)).slice(0, length);
}

/**
 * Compute a hash for string content.
 *
 * @param content - String content to hash
 * @param algorithm - Hash algorithm (default: SHA-256)
 * @param length - Hash output length in hex chars (default: 16)
 * @returns Hex-encoded hash
 *
 * @example
 * ```ts
 * const hash = await computeStringHash("hello world");
 * console.log(hash); // "b94d27b9934d3e08"
 * ```
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
 *
 * @example
 * ```ts
 * const hash = await computeCombinedHash([
 *   new Uint8Array([1, 2]),
 *   new Uint8Array([3, 4]),
 * ]);
 * ```
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
