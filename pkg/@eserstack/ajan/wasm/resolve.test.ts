// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as resolve from "./resolve.ts";

/**
 * Runs `fn` with `process.cwd()` reporting `cwd` and `ESER_AJAN_WASM_PATH` set
 * to `wasmPathOverride`.
 *
 * Resolution reads the cwd through `process.cwd()`, so stubbing it keeps the
 * monorepo's own build output and `node_modules` out of the probe without a
 * `chdir`, which would leak into other test files under `--parallel`.
 */
const withEnvironment = <T>(
  cwd: string,
  wasmPathOverride: string | undefined,
  fn: () => T,
): T => {
  // globalThis does not declare Deno, Bun or process on every runtime.
  // oxlint-disable-next-line typescript/no-explicit-any
  const g = globalThis as any;
  const originalCwd = g.process.cwd;
  const originalOverride = g.process.env["ESER_AJAN_WASM_PATH"];

  g.process.cwd = () => cwd;
  if (wasmPathOverride === undefined) {
    delete g.process.env["ESER_AJAN_WASM_PATH"];
  } else {
    g.process.env["ESER_AJAN_WASM_PATH"] = wasmPathOverride;
  }

  try {
    return fn();
  } finally {
    g.process.cwd = originalCwd;
    if (originalOverride === undefined) {
      delete g.process.env["ESER_AJAN_WASM_PATH"];
    } else {
      g.process.env["ESER_AJAN_WASM_PATH"] = originalOverride;
    }
  }
};

nodeTest.test(
  "resolveWasmPath: ESER_AJAN_WASM_PATH wins when the file exists",
  async () => {
    const tempRoot = await runtime.fs.makeTempDir({ prefix: "ajan-wasm-" });

    try {
      const override = `${tempRoot}/custom.wasm`;
      await runtime.fs.writeTextFile(override, "not a real module");
      await runtime.fs.writeTextFile(
        `${tempRoot}/eser-ajan.wasm`,
        "not a real module",
      );

      const resolved = withEnvironment(tempRoot, override, () =>
        resolve.resolveWasmPath(tempRoot),
      );

      assert.assertEquals(resolved, override);
    } finally {
      await runtime.fs.remove(tempRoot, { recursive: true });
    }
  },
);

nodeTest.test(
  "resolveWasmPath: finds the module next to the loader",
  async () => {
    const tempRoot = await runtime.fs.makeTempDir({ prefix: "ajan-wasm-" });

    try {
      await runtime.fs.writeTextFile(
        `${tempRoot}/eser-ajan.wasm`,
        "not a real module",
      );

      const resolved = withEnvironment(tempRoot, undefined, () =>
        resolve.resolveWasmPath(tempRoot),
      );

      assert.assertEquals(resolved, `${tempRoot}/eser-ajan.wasm`);
    } finally {
      await runtime.fs.remove(tempRoot, { recursive: true });
    }
  },
);

nodeTest.test(
  "resolveWasmPath: reports every probed location when nothing matches",
  async () => {
    const tempRoot = await runtime.fs.makeTempDir({ prefix: "ajan-wasm-" });

    try {
      const moduleDir = `${tempRoot}/wasm`;
      await runtime.fs.mkdir(moduleDir, { recursive: true });

      const error = assert.assertThrows(
        () =>
          withEnvironment(tempRoot, `${tempRoot}/missing.wasm`, () =>
            resolve.resolveWasmPath(moduleDir),
          ),
        Error,
      );

      assert.assertStringIncludes(
        error.message,
        `$ESER_AJAN_WASM_PATH = ${tempRoot}/missing.wasm`,
      );
      assert.assertStringIncludes(error.message, `${moduleDir}/eser-ajan.wasm`);
      assert.assertStringIncludes(
        error.message,
        `${moduleDir}/../dist/wasi/eser-ajan.wasm.bin`,
      );
      assert.assertStringIncludes(
        error.message,
        `${tempRoot}/node_modules/@eserstack/ajan-wasm/eser-ajan.wasm`,
      );
      assert.assertStringIncludes(
        error.message,
        "/usr/local/lib/eser-ajan.wasm",
      );
    } finally {
      await runtime.fs.remove(tempRoot, { recursive: true });
    }
  },
);
