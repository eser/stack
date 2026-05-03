// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as ffi from "@eserstack/ajan/ffi";
import type { HashInput, HashOptions, Loader } from "../../business/crypto.ts";
import {
  CRYPTO_HASH_FAILED,
  CRYPTO_UNKNOWN_ALGORITHM,
  CryptoError,
} from "../../business/errors.ts";

let _lib: ffi.FFILibrary | null = null;
let _libPromise: Promise<void> | null = null;

const ensureLib = (): Promise<void> => {
  if (_libPromise === null) {
    _libPromise = ffi
      .loadEserAjan()
      .then((lib) => {
        _lib = lib;
      })
      .catch(() => {});
  }
  return _libPromise;
};

const getLib = (): ffi.FFILibrary | null => _lib;

const mapErrorCode = (msg: string): string => {
  if (msg.includes("unknown hash algorithm")) return CRYPTO_UNKNOWN_ALGORITHM;
  return CRYPTO_HASH_FAILED;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
};

export const ffiLoader: Loader = {
  async hash(input: HashInput, opts?: HashOptions): Promise<string> {
    await ensureLib();
    const lib = getLib();
    if (lib === null) {
      throw new CryptoError("native library unavailable", CRYPTO_HASH_FAILED);
    }

    const req: Record<string, unknown> = {
      algorithm: opts?.algorithm ?? "SHA-256",
    };
    if (opts?.length !== undefined && opts.length > 0) {
      req["length"] = opts.length;
    }
    if (input.text !== undefined) {
      req["text"] = input.text;
    } else if (input.data !== undefined) {
      req["data"] = toBase64(input.data);
    }

    const raw = lib.symbols.EserAjanCryptoHash(JSON.stringify(req));
    const result = JSON.parse(raw) as { hash?: string; error?: string };
    if (result.error) {
      throw new CryptoError(result.error, mapErrorCode(result.error));
    }
    return result.hash ?? "";
  },
};
