// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Covers `loadEserAjanSync()`: the native and the WASM backend without
 * awaiting, one shared open with `loadEserAjan()` whichever runs first, the
 * same load error under ESER_AJAN=disabled, and the shared client's
 * `requireLibSync()` loading on demand.
 *
 * Each in-process test uses its own options, so it occupies its own entry of
 * the shared opens and closes it again without touching the default entry
 * that other test files of this isolate share (see client.test.ts).
 */

import * as nodeTest from "node:test";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as assert from "@eserstack/test-kit/assert";
import * as ffiMod from "./mod.ts";
import * as wasmResolve from "../wasm/resolve.ts";

const wasmBuilt = ((): boolean => {
  try {
    wasmResolve.resolveDefaultWasmPath();
    return true;
  } catch {
    return false;
  }
})();

const MOD_URL = new URL("./mod.ts", import.meta.url).href;
const CLIENT_URL = new URL("./client.ts", import.meta.url).href;

/** Runs `script` as an ES module in a new Node process and parses its stdout. */
const runChild = async <T>(
  script: string,
  env: Readonly<Record<string, string>> = {},
  nodeArgs: readonly string[] = [],
): Promise<T> => {
  const output = await runtime.exec.spawn(
    runtime.process.execPath(),
    ["--no-warnings", ...nodeArgs, "--input-type=module", "--eval", script],
    { env: { ...env }, stdout: "piped", stderr: "piped" },
  );
  const stderr = new TextDecoder().decode(output.stderr);

  assert.assertEquals(output.code, 0, stderr);

  return JSON.parse(new TextDecoder().decode(output.stdout)) as T;
};

nodeTest.test("loadEserAjanSync opens the native library", () => {
  const lib = ffiMod.loadEserAjanSync({ wasm: false });

  try {
    assert.assertEquals(lib.backend, "native");
    assert.assertEquals(lib.call("version").version, lib.handshake.version);
  } finally {
    lib.close();
  }
});

nodeTest.test(
  "loadEserAjanSync falls back to the WASM build when native is declined",
  { skip: !wasmBuilt && "the WASM build is missing; run make ajan-wasm" },
  () => {
    const lib = ffiMod.loadEserAjanSync({ native: false });

    try {
      assert.assertEquals(lib.backend, "wasm");
      assert.assertEquals(lib.handshake.profile, "wasi");
      const formats = lib.call("formatList") as { formats?: unknown[] };
      assert.assert(
        Array.isArray(formats.formats) && formats.formats.length > 0,
        JSON.stringify(formats),
      );
    } finally {
      lib.close();
    }
  },
);

nodeTest.test(
  "loadEserAjanSync takes the WASM fallback under --no-experimental-ffi, as loadEserAjan does",
  { skip: !wasmBuilt && "the WASM build is missing; run make ajan-wasm" },
  async () => {
    const result = await runChild<{
      backend: string;
      formats: number;
      same: boolean;
    }>(
      `
        import * as ffi from ${JSON.stringify(MOD_URL)};
        const lib = ffi.loadEserAjanSync();
        const formats = lib.call("formatList").formats.length;
        const later = await ffi.loadEserAjan();
        process.stdout.write(JSON.stringify({
          backend: lib.backend,
          formats,
          same: later.call === lib.call,
        }));
      `,
      {},
      ["--no-experimental-ffi"],
    );

    assert.assertEquals(result.backend, "wasm");
    assert.assert(result.formats > 0, JSON.stringify(result));
    assert.assertEquals(result.same, true);
  },
);

nodeTest.test(
  "a sync load followed by an async load shares one library",
  async () => {
    const options = { wasm: false, poolSize: 3 } as const;
    const first = ffiMod.loadEserAjanSync(options);
    const second = await ffiMod.loadEserAjan(options);

    try {
      assert.assertNotStrictEquals(first, second);
      assert.assertStrictEquals(first.call, second.call);
    } finally {
      first.close();
      second.close();
    }
  },
);

nodeTest.test(
  "an async load followed by a sync load shares one library",
  async () => {
    const options = { wasm: false, poolSize: 4 } as const;
    const first = await ffiMod.loadEserAjan(options);
    const second = ffiMod.loadEserAjanSync(options);

    try {
      assert.assertStrictEquals(first.call, second.call);
    } finally {
      first.close();
      second.close();
    }
  },
);

nodeTest.test(
  "a sync load while an async load is in flight shares one library",
  async () => {
    const options = { wasm: false, poolSize: 5 } as const;
    const pending = ffiMod.loadEserAjan(options);
    const synchronous = ffiMod.loadEserAjanSync(options);
    const awaited = await pending;

    try {
      assert.assertStrictEquals(synchronous.call, awaited.call);
    } finally {
      synchronous.close();
      awaited.close();
    }

    // Both holders released, so the library really closed.
    assert.assertThrows(() => awaited.call("version"), Error, "already closed");
  },
);

nodeTest.test(
  "loadEserAjanSync throws the load error of loadEserAjan under ESER_AJAN=disabled",
  async () => {
    const result = await runChild<{ sync: string; async: string }>(
      `
        import * as ffi from ${JSON.stringify(MOD_URL)};
        const out = {};
        try { ffi.loadEserAjanSync(); out.sync = "loaded"; }
        catch (error) { out.sync = error.message; }
        try { await ffi.loadEserAjan(); out.async = "loaded"; }
        catch (error) { out.async = error.message; }
        process.stdout.write(JSON.stringify(out));
      `,
      { ESER_AJAN: "disabled" },
    );

    assert.assertStringIncludes(result.sync, "ESER_AJAN=disabled");
    assert.assertEquals(result.sync, result.async);
  },
);

nodeTest.test(
  "requireLibSync loads the bridge on first use and ensureLib gets the same library",
  async () => {
    const result = await runChild<{
      backend: string;
      version: boolean;
      same: boolean;
    }>(`
      import * as client from ${JSON.stringify(CLIENT_URL)};
      const lib = client.requireLibSync();
      const version = typeof lib.call("version").version === "string";
      await client.ensureLib();
      process.stdout.write(JSON.stringify({
        backend: lib.backend,
        version,
        same: client.getLib() === lib,
      }));
    `);

    assert.assertEquals(result, {
      backend: "native",
      version: true,
      same: true,
    });
  },
);

nodeTest.test(
  "requireLibSync throws the load error as its cause under ESER_AJAN=disabled",
  async () => {
    const result = await runChild<{ message: string; cause: string }>(
      `
        import * as client from ${JSON.stringify(CLIENT_URL)};
        try {
          client.requireLibSync();
          process.stdout.write(JSON.stringify({ message: "loaded", cause: "" }));
        } catch (error) {
          process.stdout.write(JSON.stringify({
            message: error.message,
            cause: error.cause?.message ?? "",
          }));
        }
      `,
      { ESER_AJAN: "disabled" },
    );

    assert.assertStringIncludes(
      result.message,
      "eser-ajan native library unavailable",
    );
    assert.assertStringIncludes(result.cause, "ESER_AJAN=disabled");
  },
);
