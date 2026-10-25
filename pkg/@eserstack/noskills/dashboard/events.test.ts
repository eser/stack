// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
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

  bdd.it("keeps every event of concurrent appends", async () => {
    const root = await makeTempDir();
    const count = 40;

    await Promise.all(
      Array.from(
        { length: count },
        (_, i) => events.appendEvent(root, makeEvent("note", `spec-${i}`)),
      ),
    );

    const written = await events.readEvents(root);
    assert.assertEquals(written.length, count);
    assert.assertEquals(
      new Set(written.map((event) => event.spec)).size,
      count,
    );
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

bdd.describe("openEventTail", () => {
  const encoder = new TextEncoder();

  /** Appends raw bytes to the events log, as a writer part-way through a line. */
  const appendBytes = async (root: string, bytes: Uint8Array) =>
    await runtime.fs.writeFile(`${root}/${events.eventsFile}`, bytes, {
      append: true,
    });

  bdd.it("starts at the end of the log", async () => {
    const root = await makeTempDir();
    await events.appendEvent(root, makeEvent("spec-created", "old"));

    const tail = await events.openEventTail(root);
    await events.appendEvent(root, makeEvent("note", "new"));

    const read = await tail.poll();
    assert.assertEquals(read.map((event) => event.spec), ["new"]);
    assert.assertEquals(await tail.poll(), []);
  });

  bdd.it("keeps a half-written line until its newline arrives", async () => {
    const root = await makeTempDir();
    const tail = await events.openEventTail(root);
    const line = encoder.encode(
      JSON.stringify(makeEvent("note", "split")) + "\n",
    );

    await appendBytes(root, line.slice(0, 20));
    assert.assertEquals(await tail.poll(), []);

    await appendBytes(root, line.slice(20));
    const read = await tail.poll();
    assert.assertEquals(read.map((event) => event.spec), ["split"]);
  });

  bdd.it("reads a line split inside a multi-byte character", async () => {
    const root = await makeTempDir();
    await events.appendEvent(root, makeEvent("note", "before", { user: "Öz" }));
    const tail = await events.openEventTail(root);

    const line = encoder.encode(
      JSON.stringify(makeEvent("note", "after", { user: "Özge ğüş" })) + "\n",
    );
    // The byte after the first "Ö" byte, so the character is cut in two.
    const cut = line.indexOf(0xc3) + 1;

    await appendBytes(root, line.slice(0, cut));
    assert.assertEquals(await tail.poll(), []);

    await appendBytes(root, line.slice(cut));
    const read = await tail.poll();
    assert.assertEquals(read.length, 1);
    assert.assertEquals(read[0]!.user, "Özge ğüş");
  });

  bdd.it("reads nothing from a missing log until it is written", async () => {
    const root = await makeTempDir();
    const tail = await events.openEventTail(root);

    assert.assertEquals(await tail.poll(), []);

    await events.appendEvent(root, makeEvent("note", "first"));
    const read = await tail.poll();
    assert.assertEquals(read.map((event) => event.spec), ["first"]);
  });
});

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

  bdd.it(
    "does not replay the log when the first poll comes early",
    async () => {
      const root = await makeTempDir();
      for (let i = 0; i < 5; i++) {
        // Every append goes to the same log file, so they run in order.
        // deno-lint-ignore no-await-in-loop
        await events.appendEvent(root, makeEvent("note", `old-${i}`));
      }

      const received: events.DashboardEvent[] = [];
      const unsub = events.watchEvents(root, (event) => {
        received.push(event);
      }, { intervalMs: 1 });

      try {
        await new Promise((r) => setTimeout(r, 50));
        await events.appendEvent(root, makeEvent("note", "new"));
        await new Promise((r) => setTimeout(r, 100));
      } finally {
        unsub();
      }

      assert.assertEquals(received.map((event) => event.spec), ["new"]);
    },
  );
});
