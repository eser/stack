// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertRejects } from "@std/assert";
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
  assertEquals(
    persistence.isValidSessionId(persistence.generateSessionId()),
    true,
  );
  assertEquals(persistence.isValidSessionId("session-a"), true);
  for (
    const id of ["", "../victim", "a/b", "a\\b", "a.b", "..", "x".repeat(65)]
  ) {
    assertEquals(persistence.isValidSessionId(id), false, id);
  }
});

Deno.test("gc never deletes a path named inside a committed session file", async () => {
  const root = await Deno.makeTempDir();
  try {
    const sessionsDir = `${root}/.eser/.state/sessions`;
    await Deno.mkdir(sessionsDir, { recursive: true });
    const victim = `${root}/victim.json`;
    await Deno.writeTextFile(victim, "{}");

    // The repository-controlled file names a path outside the directory.
    await Deno.writeTextFile(
      `${sessionsDir}/planted.json`,
      JSON.stringify(staleSession("../../../victim")),
    );

    await persistence.gcStaleSessions(root);
    assertEquals((await Deno.stat(victim)).isFile, true);

    assertEquals(
      await persistence.deleteSession(root, "../../../victim"),
      false,
    );
    assertEquals((await Deno.stat(victim)).isFile, true);
    assertEquals(await persistence.readSession(root, "../../../victim"), null);
    await assertRejects(() =>
      persistence.createSession(root, staleSession("../escape"))
    );

    // A normal stale session is still collected.
    await persistence.createSession(root, staleSession("abcd1234"));
    assertEquals(await persistence.gcStaleSessions(root), ["abcd1234"]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
