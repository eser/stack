// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Covers the failure paths of `loadEserAjan()`.
 *
 * These are the paths a bare `catch {}` used to erase: a native library that
 * was found but would not open, an explicit path that does not exist, and a
 * restricted backend list that matches nothing. Each one has to reach the
 * caller as itself rather than as a WASM problem.
 *
 * Assertions come from `node:assert` rather than `@std/assert`: this package
 * declares no dev dependencies, so nothing is installed under
 * `pkg/@eserstack/ajan/node_modules/` to resolve `@std/assert` from.
 */

import assert from "node:assert/strict";

import * as ffiMod from "./mod.ts";

/** Runs `fn` and returns the `Error` it threw, failing the test if it did not. */
const rejection = async (fn: () => Promise<unknown>): Promise<Error> => {
  try {
    await fn();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    assert.fail(`expected an Error, got ${String(error)}`);
  }

  assert.fail("expected a rejection, got a resolved value");
};

/** Sentences that only the fallback paths compose. */
const FALLBACK_MARKERS = [
  "WASM fallback failed",
  "no fallback is available",
];

Deno.test("explicit library path rethrows instead of falling back to WASM", async () => {
  const bogusPath =
    `${import.meta.dirname}/no-such-libeser_ajan${ffiMod.getLibraryExtension()}`;

  const error = await rejection(() =>
    ffiMod.loadEserAjan(bogusPath).then((lib) => {
      lib.close();
    })
  );

  for (const marker of FALLBACK_MARKERS) {
    assert.ok(
      !error.message.includes(marker),
      `explicit path was answered by the fallback: ${error.message}`,
    );
  }
});

Deno.test("explicit path carries LoadOptions through the two-argument overload", async () => {
  const bogusPath =
    `${import.meta.dirname}/no-such-libeser_ajan${ffiMod.getLibraryExtension()}`;

  const error = await rejection(() =>
    ffiMod.loadEserAjan(bogusPath, { backends: [] }).then((lib) => {
      lib.close();
    })
  );

  // An empty allow-list matches nothing, so selection fails before the path is
  // ever opened -- which is what proves the option reached `selectBackend`.
  assert.match(error.message, /Restricted to backends:/);
});

Deno.test("selectBackend filters and orders by the backends allow-list", () => {
  assert.equal(ffiMod.detectRuntime(), "deno");
  assert.equal(ffiMod.selectBackend().name, "deno");
  assert.equal(ffiMod.selectBackend({ backends: ["deno"] }).name, "deno");

  // Unavailable entries are skipped rather than fatal, so listing them ahead of
  // the runtime's own backend still resolves.
  assert.equal(
    ffiMod.selectBackend({ backends: ["node", "bun", "deno"] }).name,
    "deno",
  );

  assert.throws(
    () => ffiMod.selectBackend({ backends: ["bun"] }),
    /Restricted to backends: bun/,
  );
  assert.throws(
    () => ffiMod.selectBackend({ backends: [] }),
    /Restricted to backends:/,
  );
});

Deno.test("fallback failures report the native cause alongside the WASM cause", async () => {
  const modUrl = new URL("./mod.ts", import.meta.url).href;

  const source = [
    `import * as ffi from ${JSON.stringify(modUrl)};`,
    `const attempt = async (options) => {`,
    `  try {`,
    `    const lib = await ffi.loadEserAjan(options);`,
    `    lib.close();`,
    `    return { loaded: true };`,
    `  } catch (error) {`,
    `    return { message: error.message, cause: error.cause?.message ?? null };`,
    `  }`,
    `};`,
    `console.log(JSON.stringify(await attempt(undefined)));`,
    `console.log(JSON.stringify(await attempt({ wasm: false })));`,
  ].join("\n");

  // A file rather than `deno eval`, which runs with all permissions and cannot
  // be restricted. Withholding --allow-read makes every candidate path
  // unreadable, so the native resolver and the WASM resolver both fail whatever
  // build artifacts happen to be present -- nothing here depends on the
  // checkout being unbuilt.
  const scriptPath = await Deno.makeTempFile({ suffix: ".mjs" });

  let stdout: string;
  let stderr: string;

  try {
    await Deno.writeTextFile(scriptPath, source);

    const output = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-env", scriptPath],
      env: {
        ESER_AJAN: "",
        ESER_AJAN_NATIVE: "",
        ESER_AJAN_WASM: "",
        ESER_AJAN_DEBUG: "1",
      },
      stdout: "piped",
      stderr: "piped",
    }).output();

    stdout = new TextDecoder().decode(output.stdout);
    stderr = new TextDecoder().decode(output.stderr);
  } finally {
    await Deno.remove(scriptPath);
  }

  const lines = stdout.trim().split("\n");
  assert.equal(lines.length, 2, `unexpected subprocess output: ${stdout}`);

  const withWasm = JSON.parse(lines[0]!) as {
    loaded?: boolean;
    message?: string;
    cause?: string | null;
  };
  const withoutWasm = JSON.parse(lines[1]!) as {
    loaded?: boolean;
    message?: string;
    cause?: string | null;
  };

  assert.equal(withWasm.loaded, undefined, `expected a failure: ${stdout}`);
  assert.match(withWasm.message ?? "", /Native error: /);
  assert.match(
    withWasm.message ?? "",
    /Could not find eser-ajan shared library/,
  );
  assert.match(withWasm.message ?? "", /WASM error: /);
  assert.match(withWasm.message ?? "", /Could not find eser-ajan WASM module/);
  assert.match(withWasm.cause ?? "", /Could not find eser-ajan shared library/);

  // WASM declined by the caller must not turn the native failure into a report
  // about the caller's own option.
  assert.equal(withoutWasm.loaded, undefined, `expected a failure: ${stdout}`);
  assert.match(
    withoutWasm.message ?? "",
    /Native FFI failed and no fallback is available/,
  );
  assert.match(
    withoutWasm.message ?? "",
    /Could not find eser-ajan shared library/,
  );
  assert.match(withoutWasm.message ?? "", /wasm=false in LoadOptions/);
  assert.match(
    withoutWasm.cause ?? "",
    /Could not find eser-ajan shared library/,
  );

  assert.match(stderr, /\[eser-ajan\/ffi\] native FFI failed: /);
});
