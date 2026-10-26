// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as client from "@eserstack/ajan/ffi/client";
import type { HashInput, HashOptions, Loader } from "../../business/crypto.ts";
import * as errors from "../../business/errors.ts";

const mapErrorCode = (msg: string): string => {
  if (msg.includes("unknown hash algorithm")) {
    return errors.CRYPTO_UNKNOWN_ALGORITHM;
  }
  return errors.CRYPTO_HASH_FAILED;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
};

export const ffiLoader: Loader = {
  hash: async (input: HashInput, opts?: HashOptions): Promise<string> => {
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

    const result = await client.callJson<{ hash?: string }>(
      (lib) => lib.call("cryptoHash", req),
      {
        onUnavailable: () =>
          new errors.CryptoError(
            "native library unavailable",
            errors.CRYPTO_HASH_FAILED,
          ),
        onError: (msg) => new errors.CryptoError(msg, mapErrorCode(msg)),
      },
    );

    return result.hash ?? "";
  },
};
