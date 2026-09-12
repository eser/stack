// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Covers handle sharing in `loadEserAjan()` and the shared client on top of it.
 *
 * Around twenty packages used to hold their own loader singleton, so one
 * process opened the same library once per package. These tests pin the two
 * properties that replaced that: callers asking for the same thing get one
 * underlying open, and a shared handle survives one holder closing it.
 *
 * The tests below deliberately pass `wasm: false` so they occupy their own
 * cache entry. The shared client loads with no options, and a test that drove
 * the refcount of the default entry to zero would close the library out from
 * under any other test file sharing this isolate's module graph.
 */

import assert from "node:assert/strict";
import * as ffiMod from "./mod.ts";
import * as client from "./client.ts";

const nativeOnly = { wasm: false } as const;

Deno.test(
  {
    name: "loadEserAjan: concurrent callers share one underlying open",
    sanitizeResources: false,
  },
  async () => {
    const [first, second] = await Promise.all([
      ffiMod.loadEserAjan(nativeOnly),
      ffiMod.loadEserAjan(nativeOnly),
    ]);

    try {
      // Distinct wrappers, because close() has to be per-caller...
      assert.notStrictEqual(first, second);
      // ...over one shared library.
      assert.strictEqual(first.symbols, second.symbols);
    } finally {
      first.close();
      second.close();
    }
  },
);

Deno.test(
  {
    name: "loadEserAjan: one holder closing does not disturb the others",
    sanitizeResources: false,
  },
  async () => {
    const first = await ffiMod.loadEserAjan(nativeOnly);
    const second = await ffiMod.loadEserAjan(nativeOnly);

    first.close();
    // Idempotent per caller: a second close must not decrement twice and drag
    // the count to zero while `second` is still holding the library.
    first.close();

    assert.equal(typeof second.symbols.EserAjanVersion(), "string");

    second.close();

    // Every holder has released, so the library really closed and the guard
    // now refuses calls rather than reaching into an unmapped image.
    assert.throws(() => second.symbols.EserAjanVersion());
  },
);

Deno.test(
  {
    name: "loadEserAjan: a released entry reopens on the next request",
    sanitizeResources: false,
  },
  async () => {
    const first = await ffiMod.loadEserAjan(nativeOnly);
    first.close();

    const second = await ffiMod.loadEserAjan(nativeOnly);

    try {
      assert.equal(typeof second.symbols.EserAjanVersion(), "string");
    } finally {
      second.close();
    }
  },
);

Deno.test(
  {
    name: "client: ensureLib is idempotent and never throws",
    sanitizeResources: false,
  },
  async () => {
    await client.ensureLib();
    await client.ensureLib();

    const lib = client.getLib();

    assert.notEqual(lib, null);
    // Whichever way it went, the two accessors must agree: a null handle with
    // no recorded reason is the state that used to make this unfixable.
    assert.equal(client.getLoadError(), null);
    assert.strictEqual(client.requireLibSync(), lib);
  },
);
