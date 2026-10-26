// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Covers the loader order of `loadEserAjan()` and its failure paths.
 *
 * The failure paths are the ones a bare `catch {}` used to erase: a native
 * library that was found but would not open, and an explicit path that does
 * not exist. Each one has to reach the caller as itself rather than as a WASM
 * problem. The loader order (node:ffi, then the WASM build, then an error)
 * runs in child processes, because turning node:ffi off takes a Node flag.
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as nodeTest from "node:test";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as assert from "@eserstack/test-kit/assert";

import * as ffiMod from "./mod.ts";
import * as wasmResolve from "../wasm/resolve.ts";

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
  "WASM fallback also failed",
  "no fallback is available",
];

nodeTest.test(
  "explicit library path rethrows instead of falling back to WASM",
  async () => {
    const bogusPath = `${import.meta.dirname}/no-such-libeser_ajan${ffiMod.getLibraryExtension()}`;

    const error = await rejection(() =>
      ffiMod.loadEserAjan(bogusPath).then((lib) => {
        lib.close();
      }),
    );

    for (const marker of FALLBACK_MARKERS) {
      assert.assert(
        !error.message.includes(marker),
        `explicit path was answered by the fallback: ${error.message}`,
      );
    }
  },
);

nodeTest.test(
  "explicit path carries LoadOptions through the two-argument overload",
  async () => {
    const bogusPath = `${import.meta.dirname}/no-such-libeser_ajan${ffiMod.getLibraryExtension()}`;

    const error = await rejection(() =>
      ffiMod
        .loadEserAjan(bogusPath, { native: false, wasm: false })
        .then((lib) => {
          lib.close();
        }),
    );

    // Both steps declined by the options, so loading fails before the path is
    // ever opened -- which is what proves the options reached the loader.
    assert.assertMatch(error.message, /native=false in LoadOptions/);
    assert.assertMatch(error.message, /wasm=false in LoadOptions/);
  },
);

/** What a child process reports about one `loadEserAjan()` attempt. */
interface Attempt {
  readonly loaded?: boolean;
  readonly version?: string;
  readonly formats?: unknown;
  readonly outsideProfile?: string;
  readonly outsideProfileCode?: string;
  readonly backend?: string;
  readonly message?: string;
  readonly cause?: string | null;
}

const MOD_URL = new URL("./mod.ts", import.meta.url).href;

/**
 * Runs `source` in a new Node process with `nodeArgs` and returns the
 * attempts it printed, one JSON line each, plus its stderr.
 *
 * The child gets the ESER_AJAN switches cleared, so the parent's environment
 * cannot pick its loader path, and `extraEnv` on top.
 */
const runChild = async (
  nodeArgs: readonly string[],
  source: string,
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<{ attempts: Attempt[]; stderr: string }> => {
  const tempDir = await fsPromises.mkdtemp(
    path.join(fs.realpathSync(os.tmpdir()), "ajan-loader-"),
  );
  const scriptPath = path.join(tempDir, "attempt.mjs");

  try {
    await fsPromises.writeFile(scriptPath, source);

    const env: Record<string, string | undefined> = { ...process.env };
    for (const name of [
      "ESER_AJAN",
      "ESER_AJAN_NATIVE",
      "ESER_AJAN_WASM",
      "ESER_AJAN_LIB_PATH",
      "ESER_AJAN_WASM_PATH",
      "NODE_OPTIONS",
      "NODE_TEST_CONTEXT",
    ]) {
      delete env[name];
    }

    const result = childProcess.spawnSync(
      crossRuntime.runtime.process.execPath(),
      [...nodeArgs, scriptPath],
      {
        env: { ...env, ESER_AJAN_DEBUG: "1", ...extraEnv },
        encoding: "utf8",
        timeout: 60_000,
      },
    );

    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    assert.assertEquals(
      result.status,
      0,
      `child exited with ${String(result.status)}: ${stdout}\n${stderr}`,
    );

    const attempts = stdout
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as Attempt);

    return { attempts, stderr };
  } finally {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  }
};

/** A child script that loads the library and reports one attempt per options value. */
const attemptScript = (optionsList: readonly string[]): string =>
  [
    `import * as ffi from ${JSON.stringify(MOD_URL)};`,
    `const attempt = async (options) => {`,
    `  let lib;`,
    `  try {`,
    `    lib = await ffi.loadEserAjan(options);`,
    `  } catch (error) {`,
    `    return { message: error.message, cause: error.cause?.message ?? null };`,
    `  }`,
    `  try {`,
    `    const version = lib.handshake.version;`,
    `    const formats = lib.call("formatList");`,
    `    let outsideProfile = "served";`,
    `    let outsideProfileCode;`,
    `    try {`,
    `      lib.call("shellExec", { command: "true" });`,
    `    } catch (error) {`,
    `      outsideProfile = error.name;`,
    `      outsideProfileCode = error.code;`,
    `    }`,
    `    return { loaded: true, backend: lib.backend, version, formats, outsideProfile, outsideProfileCode };`,
    `  } finally {`,
    `    lib.close();`,
    `  }`,
    `};`,
    ...optionsList.map(
      (options) => `console.log(JSON.stringify(await attempt(${options})));`,
    ),
  ].join("\n");

const wasmBuilt = ((): boolean => {
  try {
    wasmResolve.resolveWasmPath(`${import.meta.dirname}/../wasm`);
    return true;
  } catch {
    return false;
  }
})();

nodeTest.test(
  "--no-experimental-ffi falls back to the WASM reactor, which serves dispatcher calls",
  { skip: !wasmBuilt && "the WASM build is missing; run make ajan-wasm" },
  async () => {
    const { attempts, stderr } = await runChild(
      ["--no-experimental-ffi"],
      attemptScript(["undefined"]),
    );

    assert.assertEquals(attempts.length, 1, `unexpected output: ${stderr}`);
    const [attempt] = attempts;

    assert.assertEquals(attempt?.loaded, true, JSON.stringify(attempt));
    assert.assertEquals(attempt?.backend, "wasm");
    assert.assertMatch(attempt?.version ?? "", /\S/);
    // A successful call through the binding table.
    const formats = attempt?.formats as { formats?: unknown[] } | undefined;
    assert.assert(
      Array.isArray(formats?.formats) && formats.formats.length > 0,
      `formatList did not answer its formats: ${JSON.stringify(attempt)}`,
    );
    // Only the reactor refuses a name outside the wasi profile this way; the
    // native library would have served the call.
    assert.assertEquals(attempt?.outsideProfile, "UnsupportedInWasmError");
    assert.assertEquals(attempt?.outsideProfileCode, "UNSUPPORTED_IN_WASM");
    assert.assertMatch(stderr, /native FFI failed: node:ffi is not available/);
  },
);

nodeTest.test(
  "--no-experimental-ffi with no usable WASM build fails naming node:ffi, the flag and the fallback",
  async () => {
    const tempDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), "ajan-wasm-broken-"),
    );

    try {
      // An existing file wins resolution, so the loader takes it and fails to
      // compile it, whatever real build sits elsewhere in the checkout.
      const brokenWasm = path.join(tempDir, "eser-ajan.wasm");
      await fsPromises.writeFile(brokenWasm, "not a wasm module");

      const { attempts } = await runChild(
        ["--no-experimental-ffi"],
        attemptScript(["undefined"]),
        { ESER_AJAN_WASM_PATH: brokenWasm },
      );

      assert.assertEquals(attempts.length, 1);
      const message = attempts[0]?.message ?? "";

      assert.assertEquals(attempts[0]?.loaded, undefined, message);
      assert.assertStringIncludes(message, "node:ffi");
      assert.assertStringIncludes(message, "--no-experimental-ffi");
      assert.assertStringIncludes(message, "WASM fallback also failed to load");
      assert.assertStringIncludes(message, "Node 26.9");
      assert.assertStringIncludes(message, "--allow-ffi");
      assert.assertStringIncludes(message, "ESER_AJAN_LIB_PATH");
      assert.assertMatch(attempts[0]?.cause ?? "", /node:ffi is not available/);
    } finally {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
  },
);

nodeTest.test(
  "fallback failures report the native cause alongside the WASM cause",
  async () => {
    // The permission model grants reads of the loader's own sources only, so
    // every candidate path of both resolvers is unreadable and both fail
    // whatever build artifacts happen to be present -- nothing here depends on
    // the checkout being unbuilt.
    // Real paths, because the grants are compared after symlinks resolve (on
    // macOS the temp directory sits behind /var -> /private/var).
    const ajanDir = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
    const { attempts, stderr } = await runChild(
      [
        "--permission",
        `--allow-fs-read=${path.join(ajanDir, "ffi")}`,
        `--allow-fs-read=${path.join(ajanDir, "wasm")}`,
        `--allow-fs-read=${fs.realpathSync(os.tmpdir())}`,
      ],
      attemptScript(["undefined", "{ wasm: false }"]),
    );

    assert.assertEquals(attempts.length, 2, `unexpected output: ${stderr}`);
    const [withWasm, withoutWasm] = attempts;

    assert.assertEquals(
      withWasm?.loaded,
      undefined,
      `expected a failure: ${JSON.stringify(withWasm)}`,
    );
    assert.assertMatch(withWasm?.message ?? "", /Native error: /);
    assert.assertMatch(
      withWasm?.message ?? "",
      /Could not find eser-ajan shared library/,
    );
    assert.assertMatch(withWasm?.message ?? "", /WASM error: /);
    assert.assertMatch(
      withWasm?.message ?? "",
      /Could not find eser-ajan WASM module/,
    );
    assert.assertMatch(
      withWasm?.cause ?? "",
      /Could not find eser-ajan shared library/,
    );

    // WASM declined by the caller must not turn the native failure into a report
    // about the caller's own option.
    assert.assertEquals(
      withoutWasm?.loaded,
      undefined,
      `expected a failure: ${JSON.stringify(withoutWasm)}`,
    );
    assert.assertMatch(
      withoutWasm?.message ?? "",
      /did not load through node:ffi, and no fallback is available/,
    );
    assert.assertMatch(
      withoutWasm?.message ?? "",
      /Could not find eser-ajan shared library/,
    );
    assert.assertMatch(withoutWasm?.message ?? "", /wasm=false in LoadOptions/);
    assert.assertMatch(
      withoutWasm?.cause ?? "",
      /Could not find eser-ajan shared library/,
    );

    assert.assertMatch(stderr, /\[eser-ajan\/ffi\] native FFI failed: /);
  },
);
