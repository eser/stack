// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Logging works on the WASM fallback (TASK-278): under Node with FFI turned
 * off, the loader falls back to the reactor, and a logger is created, written
 * through on later calls and closed on that one instance.
 *
 * `--no-experimental-ffi` turns node:ffi off, so the Node backend cannot open
 * the native library and the loader falls back to the reactor (decision-37).
 *
 * @module
 */

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as resolve from "./resolve.ts";

const hasWasm = ((): boolean => {
  try {
    resolve.resolveWasmPath(import.meta.dirname);
    return true;
  } catch {
    return false;
  }
})();

const readNodeMajor = async (): Promise<number | null> => {
  try {
    const { success, stdout } = await runtime.exec.spawn("node", [
      "--version",
    ]);
    const version = new TextDecoder().decode(stdout).trim();
    return success ? Number(version.slice(1).split(".")[0]) : null;
  } catch {
    return null;
  }
};

// deno-lint-ignore no-top-level-await
const nodeMajor = (await readNodeMajor()) ?? 0;

Deno.test({
  name:
    "a logger lives on one reactor instance under node --no-experimental-ffi",
  ignore: !hasWasm || nodeMajor < 26,
  fn: async () => {
    const result = await runtime.exec.spawn(
      "node",
      [
        "--no-experimental-ffi",
        "--disable-warning=ExperimentalWarning",
        `${import.meta.dirname}/node-reactor-log.fixture.ts`,
      ],
    );

    const stdout = new TextDecoder().decode(result.stdout);
    const stderr = new TextDecoder().decode(result.stderr);
    assert.assertEquals(result.success, true, stderr);

    const seen = JSON.parse(stdout.trim()) as {
      reactor: boolean;
      handle: string;
      writes: string[];
      filtered: string;
      closed: string;
      afterClose: string;
    };
    assert.assertEquals(seen.reactor, true);
    assert.assertMatch(seen.handle, /^log-\d+$/);
    assert.assertEquals(seen.writes, ["{}", "{}", "{}"]);
    assert.assertEquals(seen.filtered, '{"filtered":true}');
    assert.assertEquals(seen.closed, "{}");
    assert.assertStringIncludes(seen.afterClose, "log handle not found");

    // The records reach the process's stderr through node:wasi, one per
    // write, with the scope once.
    const records = stderr.trim().split("\n").filter((line) =>
      line.startsWith("{")
    ).map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.assertEquals(records.map((r) => r["msg"]), [
      "write 1",
      "write 2",
      "write 3",
    ]);
    assert.assertEquals(records[0]!["scope"], "node-wasm");
  },
});
