// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { ffiLoader } from "./adapters/ffi/mod.ts";
import { CRYPTO_UNKNOWN_ALGORITHM, CryptoError } from "./business/errors.ts";
import type { HashOptions } from "./business/crypto.ts";

Deno.test(
  { name: "FFI round-trip: hash text via EserAjanCryptoHash", sanitizeResources: false },
  async () => {
    const result = await ffiLoader.hash({ text: "hello" }, { algorithm: "SHA-256", length: 64 });
    assert.assertMatch(result, /^[0-9a-f]{64}$/);
    assert.assertEquals(
      result,
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  },
);

Deno.test(
  { name: "FFI round-trip: hash bytes via EserAjanCryptoHash", sanitizeResources: false },
  async () => {
    const result = await ffiLoader.hash(
      { data: new Uint8Array([1, 2, 3]) },
      { algorithm: "SHA-256", length: 16 },
    );
    assert.assertEquals(result.length, 16);
    assert.assertMatch(result, /^[0-9a-f]+$/);
  },
);

Deno.test(
  { name: "FFI error: unknown algorithm throws CryptoError", sanitizeResources: false },
  async () => {
    const badOpts = { algorithm: "MD5" } as unknown as HashOptions;
    await assert.assertRejects(
      () => ffiLoader.hash({ text: "x" }, badOpts),
      CryptoError,
    );
    // confirm the error code is CRYPTO_UNKNOWN_ALGORITHM
    await ffiLoader.hash({ text: "x" }, badOpts).catch((e: unknown) => {
      if (e instanceof CryptoError) {
        assert.assertEquals(e.code, CRYPTO_UNKNOWN_ALGORITHM);
      }
    });
  },
);
