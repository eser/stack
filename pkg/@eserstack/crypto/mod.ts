// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cryptographic utilities for hashing, encoding, and related operations.
 *
 * @module
 */

export {
  computeCombinedHash,
  computeHash,
  computeStringHash,
  type HashAlgorithm,
} from "./hash.ts";

// FFI layer
export {
  type HashInput,
  type HashOptions,
  hashWith,
  type Loader,
} from "./business/crypto.ts";
export {
  CRYPTO_HASH_FAILED,
  CRYPTO_UNKNOWN_ALGORITHM,
  CryptoError,
} from "./business/errors.ts";
export { ffiLoader } from "./adapters/ffi/loader.ts";
