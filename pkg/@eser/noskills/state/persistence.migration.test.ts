// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for migrateLegacyLayout — one-shot migration from the pre-umbrella
 * flat layout (.eser/.state + .eser/.sessions + .eser/.events) to the unified
 * .eser/.state/{progresses,sessions,events}/ layout.
 *
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as crossRuntime from "@eser/standards/cross-runtime";
import * as persistence from "./persistence.ts";

let tempDir: string;

const writeFile = async (path: string, content: string): Promise<void> => {
  await crossRuntime.runtime.fs.writeTextFile(path, content);
};

const readFile = (path: string): Promise<string> =>
  crossRuntime.runtime.fs.readTextFile(path);

const exists = async (path: string): Promise<boolean> => {
  try {
    await crossRuntime.runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

const seedLegacyLayout = async (root: string): Promise<void> => {
  // .eser/.state/ (flat, with state.json as a file directly under it)
  await crossRuntime.runtime.fs.mkdir(`${root}/.eser/.state/specs`, {
    recursive: true,
  });
  await crossRuntime.runtime.fs.mkdir(`${root}/.eser/.state/iterations`, {
    recursive: true,
  });
  await writeFile(
    `${root}/.eser/.state/state.json`,
    JSON.stringify({ phase: "IDLE", spec: null }),
  );
  await writeFile(
    `${root}/.eser/.state/active.json`,
    JSON.stringify({ activeSpec: null }),
  );
  await writeFile(
    `${root}/.eser/.state/specs/demo.json`,
    JSON.stringify({ phase: "EXECUTING", spec: "demo" }),
  );
  await writeFile(
    `${root}/.eser/.state/files-changed.jsonl`,
    '{"file":"a.ts"}\n',
  );
  await writeFile(
    `${root}/.eser/.state/iterations/iteration-1.json`,
    '{"iteration":1}',
  );

  // .eser/.sessions/ (flat sibling)
  await crossRuntime.runtime.fs.mkdir(`${root}/.eser/.sessions`, {
    recursive: true,
  });
  await writeFile(
    `${root}/.eser/.sessions/sess1234.json`,
    JSON.stringify({ id: "sess1234", mode: "free" }),
  );

  // .eser/.events/ (flat sibling)
  await crossRuntime.runtime.fs.mkdir(`${root}/.eser/.events`, {
    recursive: true,
  });
  await writeFile(
    `${root}/.eser/.events/events.jsonl`,
    '{"type":"spec-created","spec":"demo","user":"u","ts":"2026-01-01"}\n',
  );

  // Legacy .gitignore form
  await writeFile(
    `${root}/.eser/.gitignore`,
    "# eser toolchain runtime state — not tracked by git\n.state/\n.sessions/\n.events/\n",
  );
};

bdd.describe("migrateLegacyLayout", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_migration_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("is a no-op on a clean new-layout tree", async () => {
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/.state/progresses`, {
      recursive: true,
    });
    const ran = await persistence.migrateLegacyLayout(tempDir);
    assert.assertEquals(ran, false);
  });

  bdd.it("is a no-op on an empty filesystem", async () => {
    const ran = await persistence.migrateLegacyLayout(tempDir);
    assert.assertEquals(ran, false);
  });

  bdd.it(
    "moves legacy .state sub-entries into progresses/",
    async () => {
      await seedLegacyLayout(tempDir);
      const ran = await persistence.migrateLegacyLayout(tempDir);
      assert.assertEquals(ran, true);

      // New locations exist with expected contents
      assert.assertEquals(
        await exists(`${tempDir}/.eser/.state/progresses/state.json`),
        true,
      );
      assert.assertEquals(
        await exists(`${tempDir}/.eser/.state/progresses/active.json`),
        true,
      );
      assert.assertEquals(
        await exists(
          `${tempDir}/.eser/.state/progresses/specs/demo.json`,
        ),
        true,
      );
      assert.assertEquals(
        await exists(
          `${tempDir}/.eser/.state/progresses/files-changed.jsonl`,
        ),
        true,
      );
      assert.assertEquals(
        await exists(
          `${tempDir}/.eser/.state/progresses/iterations/iteration-1.json`,
        ),
        true,
      );

      const stateContent = await readFile(
        `${tempDir}/.eser/.state/progresses/state.json`,
      );
      assert.assertEquals(
        (JSON.parse(stateContent) as { phase: string }).phase,
        "IDLE",
      );

      // Old flat state.json is gone
      assert.assertEquals(
        await exists(`${tempDir}/.eser/.state/state.json`),
        false,
      );
    },
  );

  bdd.it("moves .sessions → .state/sessions", async () => {
    await seedLegacyLayout(tempDir);
    await persistence.migrateLegacyLayout(tempDir);

    assert.assertEquals(
      await exists(`${tempDir}/.eser/.state/sessions/sess1234.json`),
      true,
    );
    assert.assertEquals(
      await exists(`${tempDir}/.eser/.sessions`),
      false,
    );
  });

  bdd.it("moves .events → .state/events", async () => {
    await seedLegacyLayout(tempDir);
    await persistence.migrateLegacyLayout(tempDir);

    assert.assertEquals(
      await exists(`${tempDir}/.eser/.state/events/events.jsonl`),
      true,
    );
    const eventsContent = await readFile(
      `${tempDir}/.eser/.state/events/events.jsonl`,
    );
    assert.assertEquals(eventsContent.includes("spec-created"), true);
    assert.assertEquals(await exists(`${tempDir}/.eser/.events`), false);
  });

  bdd.it("rewrites .gitignore to the collapsed single-entry form", async () => {
    await seedLegacyLayout(tempDir);
    await persistence.migrateLegacyLayout(tempDir);

    const gitignore = await readFile(`${tempDir}/.eser/.gitignore`);
    assert.assertEquals(gitignore.includes(".sessions/"), false);
    assert.assertEquals(gitignore.includes(".events/"), false);
    assert.assertEquals(gitignore.includes(".state/"), true);
  });

  bdd.it("is idempotent — second run is a no-op", async () => {
    await seedLegacyLayout(tempDir);
    const first = await persistence.migrateLegacyLayout(tempDir);
    const second = await persistence.migrateLegacyLayout(tempDir);
    assert.assertEquals(first, true);
    assert.assertEquals(second, false);
  });

  bdd.it(
    "aborts on partial migration (both legacy state.json file and new progresses dir)",
    async () => {
      await seedLegacyLayout(tempDir);
      // Simulate a half-migrated tree: new progresses/ already exists
      // alongside the legacy flat state.json file.
      await crossRuntime.runtime.fs.mkdir(
        `${tempDir}/.eser/.state/progresses`,
        { recursive: true },
      );

      await assert.assertRejects(
        () => persistence.migrateLegacyLayout(tempDir),
        Error,
        "partial migration detected",
      );
    },
  );

  bdd.it("migrates only .sessions when only .sessions is legacy", async () => {
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/.sessions`, {
      recursive: true,
    });
    await writeFile(
      `${tempDir}/.eser/.sessions/s1.json`,
      '{"id":"s1"}',
    );

    const ran = await persistence.migrateLegacyLayout(tempDir);
    assert.assertEquals(ran, true);
    assert.assertEquals(
      await exists(`${tempDir}/.eser/.state/sessions/s1.json`),
      true,
    );
    assert.assertEquals(await exists(`${tempDir}/.eser/.sessions`), false);
  });
});
