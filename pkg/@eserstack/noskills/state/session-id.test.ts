// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as persistence from "./persistence.ts";

const staleSession = (id: string): persistence.Session => ({
  id,
  spec: null,
  mode: "free",
  phase: null,
  pid: 0,
  startedAt: "2000-01-01T00:00:00.000Z",
  lastActiveAt: "2000-01-01T00:00:00.000Z",
  tool: "test",
});

Deno.test("isValidSessionId accepts generated and simple ids only", () => {
  assert.assertEquals(
    persistence.isValidSessionId(persistence.generateSessionId()),
    true,
  );
  assert.assertEquals(persistence.isValidSessionId("session-a"), true);
  for (const id of [
    "",
    "../victim",
    "a/b",
    "a\\b",
    "a.b",
    "..",
    "x".repeat(65),
  ]) {
    assert.assertEquals(persistence.isValidSessionId(id), false, id);
  }
});

Deno.test("gc never deletes a path named inside a committed session file", async () => {
  const root = await runtime.fs.makeTempDir();
  try {
    const sessionsDir = `${root}/.eser/.state/sessions`;
    await runtime.fs.mkdir(sessionsDir, { recursive: true });
    const victim = `${root}/victim.json`;
    await runtime.fs.writeTextFile(victim, "{}");

    // The repository-controlled file names a path outside the directory.
    await runtime.fs.writeTextFile(
      `${sessionsDir}/planted.json`,
      JSON.stringify(staleSession("../../../victim")),
    );

    await persistence.gcStaleSessions(root);
    assert.assertEquals((await runtime.fs.stat(victim)).isFile, true);

    assert.assertEquals(
      await persistence.deleteSession(root, "../../../victim"),
      false,
    );
    assert.assertEquals((await runtime.fs.stat(victim)).isFile, true);
    assert.assertEquals(
      await persistence.readSession(root, "../../../victim"),
      null,
    );
    await assert.assertRejects(() =>
      persistence.createSession(root, staleSession("../escape")),
    );

    // A normal stale session is still collected.
    await persistence.createSession(root, staleSession("abcd1234"));
    assert.assertEquals(await persistence.gcStaleSessions(root), ["abcd1234"]);
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});
