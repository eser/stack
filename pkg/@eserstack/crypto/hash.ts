// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Content hashing utilities.
 *
 * Go owns the hashing (`pkg/ajan/cryptofx`): every function asks it through
 * the `@eserstack/ajan` bridge, the native library or its WASM build, and
 * rejects with the bridge's load error when neither loads.
 *
 * @module
 */

import * as ffiClient from "./ffi-client.ts";

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

/** Turns a `cryptoHash` or `cryptoHashCombined` answer into the digest. */
const digestOf = (answer: {
  readonly hash?: string;
  readonly error?: string;
}): string => {
  if (answer.error !== undefined) {
    throw new Error(answer.error);
  }

  return answer.hash ?? "";
};

/**
 * Compute a content hash.
 *
 * @param content - Content to hash
 * @param algorithm - Hash algorithm (default: SHA-256)
 * @param length - Hash output length in hex chars (default: 16)
 * @returns Hex-encoded hash
 * @throws {Error} When the bridge does not load (its load error is the `cause`)
 *   or Go refuses the request, such as for an unknown algorithm
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
  const lib = await ffiClient.requireLib();

  return digestOf(
    lib.call("cryptoHash", { data: toBase64(content), algorithm, length }),
  );
};

/**
 * Compute a hash for string content.
 *
 * @param content - String content to hash
 * @param algorithm - Hash algorithm (default: SHA-256)
 * @param length - Hash output length in hex chars (default: 16)
 * @returns Hex-encoded hash
 * @throws {Error} When the bridge does not load (its load error is the `cause`)
 *   or Go refuses the request, such as for an unknown algorithm
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
  const lib = await ffiClient.requireLib();

  return digestOf(lib.call("cryptoHash", { text: content, algorithm, length }));
};

/**
 * Compute a hash for multiple pieces of content, hashed in order as one
 * input.
 *
 * @param contents - Array of content to hash together
 * @param algorithm - Hash algorithm (default: SHA-256)
 * @param length - Hash output length in hex chars (default: 16)
 * @returns Hex-encoded hash
 * @throws {Error} When the bridge does not load (its load error is the `cause`)
 *   or Go refuses the request, such as for an unknown algorithm
 *
 * @example
 * ```ts
 * const hash = await computeCombinedHash([
 *   new Uint8Array([1, 2]),
 *   new Uint8Array([3, 4]),
 * ]);
 * ```
 */
export const computeCombinedHash = async (
  contents: readonly Uint8Array[],
  algorithm: HashAlgorithm = "SHA-256",
  length = 16,
): Promise<string> => {
  const lib = await ffiClient.requireLib();

  return digestOf(
    lib.call("cryptoHashCombined", {
      parts: contents.map((part) => toBase64(part)),
      algorithm,
      length,
    }),
  );
};
