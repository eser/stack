// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Pins that state writes are atomic and that a corrupt file is not silent.
 *
 * Both writers used to be a plain `writeTextFile`, which truncates before it
 * writes. A crash between those steps leaves a truncated file — and because
 * every reader caught everything and returned `createInitialState()`, that
 * torn file presented as a brand-new project rather than as damage. The work
 * disappeared with no error anywhere.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as persistence from "./persistence.ts";
import * as schema from "./schema.ts";

let tempDir: string;

bdd.describe("state persistence — atomic writes", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_atomic_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("leaves no temporary files behind after a write", async () => {
    await persistence.writeState(tempDir, schema.createInitialState());

    const entries: string[] = [];
    for await (
      const entry of crossRuntime.runtime.fs.readDir(
        `${tempDir}/${persistence.paths.progressesDir}`,
      )
    ) {
      entries.push(entry.name);
    }

    assert.assertEquals(
      entries.filter((name) => name.endsWith(".tmp")),
      [],
      "a temporary file survived the write",
    );
    assert.assert(entries.includes("state.json"));
  });

  bdd.it("round-trips state through the atomic path", async () => {
    const written = {
      ...schema.createInitialState(),
      phase: "EXECUTING",
    } as schema.StateFile;

    await persistence.writeState(tempDir, written);
    const read = await persistence.readState(tempDir);

    assert.assertEquals(read.phase, "EXECUTING");
  });

  bdd.it(
    "reports a corrupt state file instead of silently resetting",
    async () => {
      await crossRuntime.runtime.fs.mkdir(
        `${tempDir}/${persistence.paths.progressesDir}`,
        { recursive: true },
      );
      // A truncated JSON document, exactly what an interrupted write produced.
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/${persistence.paths.stateFile}`,
        '{"phase": "EXEC',
      );

      const warnings: string[] = [];
      const originalError = console.error;
      console.error = (...args: unknown[]): void => {
        warnings.push(args.map(String).join(" "));
      };

      try {
        const state = await persistence.readState(tempDir);

        // Behaviour is unchanged -- callers still get a usable state -- but the
        // operator is now told the file exists and could not be read.
        assert.assertEquals(state.phase, schema.createInitialState().phase);
        assert.assert(
          warnings.some((line) => line.includes("could not be read")),
          `expected a corruption warning, got: ${JSON.stringify(warnings)}`,
        );
      } finally {
        console.error = originalError;
      }
    },
  );

  bdd.it("one unreadable spec state does not hide the others", async () => {
    const dir = `${tempDir}/${persistence.paths.specStatesDir}`;
    await crossRuntime.runtime.fs.mkdir(dir, { recursive: true });

    const good = JSON.stringify(schema.createInitialState());
    // Names chosen so the broken file sorts first: the old code caught at the
    // loop level, so whichever entry failed hid every entry after it.
    await crossRuntime.runtime.fs.writeTextFile(`${dir}/a-broken.json`, "{not");
    await crossRuntime.runtime.fs.writeTextFile(`${dir}/b-fine.json`, good);
    await crossRuntime.runtime.fs.writeTextFile(`${dir}/c-fine.json`, good);

    const originalError = console.error;
    console.error = (): void => {};

    try {
      const listed = await persistence.listSpecStates(tempDir);
      const names = listed.map((entry) => entry.name).sort();

      assert.assertEquals(
        names,
        ["b-fine", "c-fine"],
        "a single malformed file truncated the listing",
      );
    } finally {
      console.error = originalError;
    }
  });

  bdd.it("stays silent when the state file is merely absent", async () => {
    const warnings: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]): void => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      await persistence.readState(tempDir);

      assert.assertEquals(
        warnings.filter((line) => line.includes("could not be read")),
        [],
        "an uninitialised project must not be reported as corrupt",
      );
    } finally {
      console.error = originalError;
    }
  });
});
