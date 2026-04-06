// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Session management unit tests.
 * @module
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as crossRuntime from "@eser/standards/cross-runtime";
import * as persistence from "../state/persistence.ts";

let tempDir: string;

// Helper to create a session object
const makeSession = (
  overrides: Partial<persistence.Session> = {},
): persistence.Session => ({
  id: persistence.generateSessionId(),
  spec: null,
  mode: "free",
  phase: null,
  pid: 0,
  startedAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
  tool: "claude-code",
  ...overrides,
});

// Helper to create a stale session (3 hours old)
const makeStaleSession = (
  overrides: Partial<persistence.Session> = {},
): persistence.Session => {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)
    .toISOString();
  return makeSession({
    startedAt: threeHoursAgo,
    lastActiveAt: threeHoursAgo,
    ...overrides,
  });
};

bdd.describe("Session persistence", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "session_",
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/.state/sessions`, {
      recursive: true,
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // Test: createSession writes session file
  bdd.it("createSession writes session file", async () => {
    const session = makeSession({ id: "test1234" });
    await persistence.createSession(tempDir, session);

    const content = await crossRuntime.runtime.fs.readTextFile(
      `${tempDir}/.eser/.state/sessions/test1234.json`,
    );
    const parsed = JSON.parse(content) as persistence.Session;
    assert.assertEquals(parsed.id, "test1234");
    assert.assertEquals(parsed.mode, "free");
  });

  // Test: free session has correct fields
  bdd.it("free session has mode free, spec null, phase null", async () => {
    const session = makeSession({ mode: "free" });
    await persistence.createSession(tempDir, session);

    const read = await persistence.readSession(tempDir, session.id);
    assert.assert(read !== null);
    assert.assertEquals(read.mode, "free");
    assert.assertEquals(read.spec, null);
    assert.assertEquals(read.phase, null);
  });

  // Test: spec session has correct fields
  bdd.it(
    "spec session has mode spec with spec name and phase",
    async () => {
      const session = makeSession({
        mode: "spec",
        spec: "my-feature",
        phase: "DISCOVERY",
      });
      await persistence.createSession(tempDir, session);

      const read = await persistence.readSession(tempDir, session.id);
      assert.assert(read !== null);
      assert.assertEquals(read.mode, "spec");
      assert.assertEquals(read.spec, "my-feature");
      assert.assertEquals(read.phase, "DISCOVERY");
    },
  );

  // Test: session file has all required fields
  bdd.it("session file has all required fields", async () => {
    const session = makeSession({
      id: "abcd1234",
      spec: "test-spec",
      mode: "spec",
      phase: "EXECUTING",
    });
    await persistence.createSession(tempDir, session);

    const read = await persistence.readSession(tempDir, session.id);
    assert.assert(read !== null);
    assert.assertEquals(typeof read.id, "string");
    assert.assertEquals(typeof read.mode, "string");
    assert.assertEquals(typeof read.pid, "number");
    assert.assertEquals(typeof read.startedAt, "string");
    assert.assertEquals(typeof read.lastActiveAt, "string");
    assert.assertEquals(typeof read.tool, "string");
  });

  // Test: readSession returns null for nonexistent
  bdd.it("readSession returns null for nonexistent session", async () => {
    const read = await persistence.readSession(tempDir, "nonexistent");
    assert.assertEquals(read, null);
  });

  // Test: two sessions can coexist
  bdd.it("two sessions can coexist with different IDs", async () => {
    const s1 = makeSession({ id: "session-a", mode: "free" });
    const s2 = makeSession({
      id: "session-b",
      mode: "spec",
      spec: "feat-x",
      phase: "DISCOVERY",
    });

    await persistence.createSession(tempDir, s1);
    await persistence.createSession(tempDir, s2);

    const sessions = await persistence.listSessions(tempDir);
    assert.assertEquals(sessions.length, 2);

    const ids = sessions.map((s) => s.id).sort();
    assert.assertEquals(ids, ["session-a", "session-b"]);
  });

  // Test: listSessions returns all sessions
  bdd.it("listSessions returns all active sessions", async () => {
    await persistence.createSession(tempDir, makeSession({ id: "s1" }));
    await persistence.createSession(tempDir, makeSession({ id: "s2" }));
    await persistence.createSession(tempDir, makeSession({ id: "s3" }));

    const sessions = await persistence.listSessions(tempDir);
    assert.assertEquals(sessions.length, 3);
  });

  // Test: listSessions returns empty for no sessions
  bdd.it("listSessions returns empty when no sessions", async () => {
    const sessions = await persistence.listSessions(tempDir);
    assert.assertEquals(sessions.length, 0);
  });

  // Test: deleteSession removes session file
  bdd.it("deleteSession removes session file", async () => {
    const session = makeSession({ id: "to-delete" });
    await persistence.createSession(tempDir, session);

    const deleted = await persistence.deleteSession(tempDir, "to-delete");
    assert.assertEquals(deleted, true);

    const read = await persistence.readSession(tempDir, "to-delete");
    assert.assertEquals(read, null);
  });

  // Test: deleteSession returns false for nonexistent
  bdd.it(
    "deleteSession returns false for nonexistent session",
    async () => {
      const deleted = await persistence.deleteSession(
        tempDir,
        "nonexistent",
      );
      assert.assertEquals(deleted, false);
    },
  );

  // Test: generateSessionId returns 8-char hex string
  bdd.it("generateSessionId returns 8-char hex string", () => {
    const id = persistence.generateSessionId();
    assert.assertEquals(id.length, 8);
    assert.assert(/^[0-9a-f]{8}$/.test(id));
  });

  // Test: generateSessionId returns unique values
  bdd.it("generateSessionId returns unique values", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(persistence.generateSessionId());
    }
    assert.assertEquals(ids.size, 100);
  });
});

bdd.describe("Session staleness", () => {
  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "session_stale_",
    });
    await crossRuntime.runtime.fs.mkdir(`${tempDir}/.eser/.state/sessions`, {
      recursive: true,
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  // Test: isSessionStale returns true for old sessions
  bdd.it("isSessionStale returns true for session > 2h old", () => {
    const session = makeStaleSession();
    assert.assertEquals(persistence.isSessionStale(session), true);
  });

  // Test: isSessionStale returns false for recent sessions
  bdd.it("isSessionStale returns false for recent session", () => {
    const session = makeSession();
    assert.assertEquals(persistence.isSessionStale(session), false);
  });

  // Test: gcStaleSessions removes stale, keeps fresh
  bdd.it(
    "gcStaleSessions removes stale sessions and keeps fresh ones",
    async () => {
      const fresh = makeSession({ id: "fresh-one" });
      const stale = makeStaleSession({ id: "stale-one" });

      await persistence.createSession(tempDir, fresh);
      await persistence.createSession(tempDir, stale);

      const removed = await persistence.gcStaleSessions(tempDir);
      assert.assertEquals(removed.length, 1);
      assert.assert(removed.includes("stale-one"));

      // Fresh one should still exist
      const remaining = await persistence.listSessions(tempDir);
      assert.assertEquals(remaining.length, 1);
      assert.assertEquals(remaining[0]!.id, "fresh-one");
    },
  );

  // Test: gcStaleSessions returns empty when nothing stale
  bdd.it(
    "gcStaleSessions returns empty when no stale sessions",
    async () => {
      await persistence.createSession(
        tempDir,
        makeSession({ id: "active" }),
      );

      const removed = await persistence.gcStaleSessions(tempDir);
      assert.assertEquals(removed.length, 0);
    },
  );
});
