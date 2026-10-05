// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as events from "./events.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Helpers
// =============================================================================

let tempCounter = 0;
const makeTempDir = async (): Promise<string> => {
  const base = await runtime.fs.makeTempDir();
  const dir = `${base}/noskills-test-${tempCounter++}`;
  await runtime.fs.mkdir(`${dir}/.eser/.state/events`, { recursive: true });
  return dir;
};

const makeEvent = (
  type: events.EventType,
  spec: string,
  overrides?: Record<string, unknown>,
): events.DashboardEvent => ({
  ts: new Date().toISOString(),
  type,
  spec,
  user: "test-user",
  ...overrides,
});

// =============================================================================
// appendEvent
// =============================================================================

bdd.describe("appendEvent", () => {
  bdd.it("creates JSONL file if not exists", async () => {
    const root = await makeTempDir();
    await events.appendEvent(root, makeEvent("spec-created", "test-spec"));

    const content = await runtime.fs.readTextFile(
      `${root}/${events.eventsFile}`,
    );
    assert.assert(content.length > 0);
    const parsed = JSON.parse(content.trim());
    assert.assertEquals(parsed.type, "spec-created");
    assert.assertEquals(parsed.spec, "test-spec");
  });

  bdd.it("appends multiple events as separate lines", async () => {
    const root = await makeTempDir();
    await events.appendEvent(root, makeEvent("spec-created", "spec-1"));
    await events.appendEvent(root, makeEvent("phase-change", "spec-1"));
    await events.appendEvent(root, makeEvent("note", "spec-1"));

    const content = await runtime.fs.readTextFile(
      `${root}/${events.eventsFile}`,
    );
    const lines = content.trim().split("\n");
    assert.assertEquals(lines.length, 3);
  });

  bdd.it("each line is valid JSON", async () => {
    const root = await makeTempDir();
    await events.appendEvent(root, makeEvent("spec-created", "s1"));
    await events.appendEvent(
      root,
      makeEvent("phase-change", "s1", { from: "IDLE", to: "DISCOVERY" }),
    );

    const content = await runtime.fs.readTextFile(
      `${root}/${events.eventsFile}`,
    );
    for (const line of content.trim().split("\n")) {
      const parsed = JSON.parse(line);
      assert.assert(typeof parsed.ts === "string");
      assert.assert(typeof parsed.type === "string");
    }
  });

  bdd.it("creates events directory if missing", async () => {
    const base = await runtime.fs.makeTempDir();
    const root = `${base}/fresh-${tempCounter++}`;
    await runtime.fs.mkdir(`${root}/.eser`, { recursive: true });
    // No .state/events dir yet

    await events.appendEvent(root, makeEvent("spec-created", "test"));

    const content = await runtime.fs.readTextFile(
      `${root}/${events.eventsFile}`,
    );
    assert.assert(content.includes("spec-created"));
  });
});

// =============================================================================
// readEvents
// =============================================================================

bdd.describe("readEvents", () => {
  bdd.it("returns empty array when no events file", async () => {
    const root = await makeTempDir();
    const result = await events.readEvents(root);
    assert.assertEquals(result.length, 0);
  });

  bdd.it("returns events in newest-first order", async () => {
    const root = await makeTempDir();
    await events.appendEvent(
      root,
      makeEvent("spec-created", "s1", { ts: "2026-01-01T00:00:00Z" }),
    );
    await events.appendEvent(
      root,
      makeEvent("phase-change", "s1", { ts: "2026-01-02T00:00:00Z" }),
    );
    await events.appendEvent(
      root,
      makeEvent("note", "s1", { ts: "2026-01-03T00:00:00Z" }),
    );

    const result = await events.readEvents(root);
    assert.assertEquals(result.length, 3);
    assert.assertEquals(result[0]!.type, "note"); // newest first
    assert.assertEquals(result[2]!.type, "spec-created"); // oldest last
  });

  bdd.it("respects limit option", async () => {
    const root = await makeTempDir();
    for (let i = 0; i < 10; i++) {
      // Every append goes to the same log file, so they run in order.
      // deno-lint-ignore no-await-in-loop
      await events.appendEvent(root, makeEvent("note", "s1"));
    }

    const result = await events.readEvents(root, { limit: 3 });
    assert.assertEquals(result.length, 3);
  });

  bdd.it("respects since option", async () => {
    const root = await makeTempDir();
    await events.appendEvent(
      root,
      makeEvent("spec-created", "s1", { ts: "2026-01-01T00:00:00Z" }),
    );
    await events.appendEvent(
      root,
      makeEvent("phase-change", "s1", { ts: "2026-01-05T00:00:00Z" }),
    );

    const result = await events.readEvents(root, {
      since: "2026-01-03T00:00:00Z",
    });
    assert.assertEquals(result.length, 1);
    assert.assertEquals(result[0]!.type, "phase-change");
  });

  bdd.it("skips malformed lines", async () => {
    const root = await makeTempDir();
    const file = `${root}/${events.eventsFile}`;
    await runtime.fs.writeTextFile(
      file,
      '{"ts":"2026-01-01","type":"note","spec":"s1","user":"u"}\nnot-json\n{"ts":"2026-01-02","type":"note","spec":"s1","user":"u"}\n',
    );

    const result = await events.readEvents(root);
    assert.assertEquals(result.length, 2);
  });
});

// =============================================================================
// watchEvents
// =============================================================================

bdd.describe("watchEvents", () => {
  bdd.it("returns an unsubscribe function", () => {
    const unsub = events.watchEvents("/nonexistent", () => {});
    assert.assertEquals(typeof unsub, "function");
    unsub(); // should not throw
  });

  bdd.it("fires callback on new events", async () => {
    const root = await makeTempDir();
    // Create initial file
    await events.appendEvent(root, makeEvent("spec-created", "s1"));

    const received: events.DashboardEvent[] = [];
    const unsub = events.watchEvents(root, (event) => {
      received.push(event);
    });

    // Wait for initial size detection
    await new Promise((r) => setTimeout(r, 100));

    // Write a new event
    await events.appendEvent(root, makeEvent("phase-change", "s1"));

    // Wait for poll interval
    await new Promise((r) => setTimeout(r, 700));

    unsub();
    assert.assertEquals(received.length, 1);
    assert.assertEquals(received[0]!.type, "phase-change");
  });
});
