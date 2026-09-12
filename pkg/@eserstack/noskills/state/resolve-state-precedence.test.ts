// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Pins that the per-spec state file wins over a stale global one.
 *
 * This is the invariant the pre-tool-use file-edit gate depends on. That gate
 * used to read `readState(root)` directly in its no-session branch, so once a
 * spec-scoped command had moved the spec's phase, the gate kept reading the
 * global copy — which still said EXECUTING — and permitted edits the state
 * machine no longer allowed. No crash, no error: just enforcement silently
 * applying a phase that was no longer current.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as persistence from "./persistence.ts";
import * as schema from "./schema.ts";

let tempDir: string;

bdd.describe("resolveState — per-spec precedence", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_resolve_state_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it(
    "prefers the per-spec file when the global copy is stale",
    async () => {
      const specName = "example-spec";

      // The spec directory has to exist or resolveState refuses to guess.
      await crossRuntime.runtime.fs.mkdir(
        `${tempDir}/${persistence.paths.specDir(specName)}`,
        { recursive: true },
      );

      const stale = {
        ...schema.createInitialState(),
        spec: specName,
        phase: "EXECUTING",
      } as schema.StateFile;
      await persistence.writeState(tempDir, stale);

      const current = {
        ...schema.createInitialState(),
        spec: specName,
        phase: "DISCOVERY",
      } as schema.StateFile;
      await persistence.writeSpecState(tempDir, specName, current);

      const resolved = await persistence.resolveState(tempDir, specName);

      assert.assertEquals(
        resolved.phase,
        "DISCOVERY",
        "the stale global phase was served instead of the per-spec one",
      );
    },
  );

  bdd.it("falls back to the global state when no spec is named", async () => {
    const state = {
      ...schema.createInitialState(),
      phase: "EXECUTING",
    } as schema.StateFile;
    await persistence.writeState(tempDir, state);

    const resolved = await persistence.resolveState(tempDir, null);

    assert.assertEquals(resolved.phase, "EXECUTING");
  });
});
