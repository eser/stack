// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for backward-compat normalization of state file shape on read.
 *
 * Distinct from persistence.migration.test.ts, which exercises physical
 * directory layout migration. These tests cover in-memory state shape
 * normalizations applied by readState/readSpecState — currently the
 * legacy `discovery.userContext: string` → `readonly string[]` migration.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as persistence from "./persistence.ts";
import * as schema from "./schema.ts";

let tempDir: string;

const writeStateFile = async (
  root: string,
  rawState: Record<string, unknown>,
): Promise<void> => {
  const dir = `${root}/.eser/.state/progresses`;
  await crossRuntime.runtime.fs.mkdir(dir, { recursive: true });
  await crossRuntime.runtime.fs.writeTextFile(
    `${dir}/state.json`,
    JSON.stringify(rawState, null, 2) + "\n",
  );
};

const baseState = (): Record<string, unknown> => {
  const initial = schema.createInitialState();
  // Clone via JSON to get a mutable plain object.
  return JSON.parse(JSON.stringify(initial)) as Record<string, unknown>;
};

bdd.describe("readState — backward-compat normalization", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_state_migration_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("normalizes legacy userContext:string to array", async () => {
    const raw = baseState();
    (raw["discovery"] as Record<string, unknown>)["userContext"] =
      "hello world";
    await writeStateFile(tempDir, raw);

    const loaded = await persistence.readState(tempDir);

    assert.assertEquals(loaded.discovery.userContext, ["hello world"]);
  });

  bdd.it("preserves userContext:string[] unchanged", async () => {
    const raw = baseState();
    (raw["discovery"] as Record<string, unknown>)["userContext"] = ["a", "b"];
    await writeStateFile(tempDir, raw);

    const loaded = await persistence.readState(tempDir);

    assert.assertEquals(loaded.discovery.userContext, ["a", "b"]);
  });

  bdd.it("loads state without userContext field cleanly", async () => {
    const raw = baseState();
    // Ensure userContext is not present at all.
    delete (raw["discovery"] as Record<string, unknown>)["userContext"];
    await writeStateFile(tempDir, raw);

    const loaded = await persistence.readState(tempDir);

    assert.assertEquals(loaded.discovery.userContext, undefined);
  });

  bdd.it("handles userContext: null gracefully", async () => {
    const raw = baseState();
    (raw["discovery"] as Record<string, unknown>)["userContext"] = null;
    await writeStateFile(tempDir, raw);

    const loaded = await persistence.readState(tempDir);

    assert.assertEquals(loaded.discovery.userContext, undefined);
  });

  bdd.it("normalizes empty legacy string to empty array", async () => {
    const raw = baseState();
    (raw["discovery"] as Record<string, unknown>)["userContext"] = "";
    await writeStateFile(tempDir, raw);

    const loaded = await persistence.readState(tempDir);

    assert.assertEquals(loaded.discovery.userContext, []);
  });
});
