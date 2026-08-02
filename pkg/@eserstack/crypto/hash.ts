// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Content hashing utilities.
 *
 * Delegates all operations to the native Go library.
 *
 * @module
 */

import { ensureLib, getLib } from "./ffi-client.ts";

/**
 * Hash algorithm options.
 */
export type HashAlgorithm = "SHA-256" | "SHA-384" | "SHA-512" | "SHA-1";

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
};

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
export const computeHash = async (
  content: Uint8Array,
  algorithm: HashAlgorithm = "SHA-256",
  length = 16,
): Promise<string> => {
  await ensureLib();
  const lib = getLib();
  if (lib === null) {
    throw new Error("native library unavailable");
  }

  const raw = lib.symbols.EserAjanCryptoHash(
    JSON.stringify({ data: toBase64(content), algorithm, length }),
  );
  const result = JSON.parse(raw) as { hash: string; error?: string };
  if (result.error) {
    throw new Error(result.error);
  }
  return result.hash;
};

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
export const computeStringHash = async (
  content: string,
  algorithm: HashAlgorithm = "SHA-256",
  length = 16,
): Promise<string> => {
  await ensureLib();
  const lib = getLib();
  if (lib === null) {
    throw new Error("native library unavailable");
  }

  const raw = lib.symbols.EserAjanCryptoHash(
    JSON.stringify({ text: content, algorithm, length }),
  );
  const result = JSON.parse(raw) as { hash: string; error?: string };
  if (result.error) {
    throw new Error(result.error);
  }
  return result.hash;
};

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
export const computeCombinedHash = (
  contents: readonly Uint8Array[],
  algorithm: HashAlgorithm = "SHA-256",
  length = 16,
): Promise<string> => {
  const totalLength = contents.reduce((sum, c) => sum + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const content of contents) {
    combined.set(content, offset);
    offset += content.length;
  }
  return computeHash(combined, algorithm, length);
};
