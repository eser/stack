// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export class CryptoError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = "CryptoError";
    this.code = code;
    this.cause = cause;
  }
}

export const CRYPTO_HASH_FAILED = "CRYPTO_HASH_FAILED";
export const CRYPTO_UNKNOWN_ALGORITHM = "CRYPTO_UNKNOWN_ALGORITHM";
