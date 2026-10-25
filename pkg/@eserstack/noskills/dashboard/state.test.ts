// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as dashboardState from "./state.ts";
import * as actions from "./actions.ts";
import * as events from "./events.ts";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as persistence from "../state/persistence.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Helpers
// =============================================================================

let tempCounter = 0;
const makeTempDir = async (): Promise<string> => {
  const base = await runtime.fs.makeTempDir();
  const dir = `${base}/noskills-dashboard-test-${tempCounter++}`;
  await persistence.scaffoldEserDir(dir);
  return dir;
};

const createSpec = async (
  root: string,
  name: string,
  description: string,
): Promise<void> => {
  const state = schema.createInitialState();
  const specState = machine.startSpec(state, name, `spec/${name}`, description);

  await runtime.fs.mkdir(
    `${root}/${persistence.paths.specDir(name)}`,
    { recursive: true },
  );
  await persistence.writeSpecState(root, name, specState);
};

const createExecutingSpec = async (
  root: string,
  name: string,
): Promise<void> => {
  let state = schema.createInitialState();
  state = machine.startSpec(state, name, `spec/${name}`, "test description");
  state = machine.completeDiscovery(state);
  state = machine.approveDiscoveryReview(state);
  state = machine.approveSpec(state);
  state = machine.startExecution(state);

  await runtime.fs.mkdir(
    `${root}/${persistence.paths.specDir(name)}`,
    { recursive: true },
  );
  await persistence.writeSpecState(root, name, state);
};

// =============================================================================
// getState
// =============================================================================

bdd.describe("dashboard.getState", () => {
  bdd.it("returns empty specs when no specs exist", async () => {
    const root = await makeTempDir();
    const state = await dashboardState.getState(root);

    assert.assertEquals(state.specs.length, 0);
    assert.assertEquals(state.activeSpec, null);
    assert.assertEquals(state.recentEvents.length, 0);
  });

  bdd.it("returns specs with correct phase", async () => {
    const root = await makeTempDir();
    await createSpec(root, "feature-a", "Add feature A");

    const state = await dashboardState.getState(root);

    assert.assertEquals(state.specs.length, 1);
    assert.assertEquals(state.specs[0]!.name, "feature-a");
    assert.assertEquals(state.specs[0]!.phase, "DISCOVERY");
    assert.assertEquals(state.specs[0]!.description, "Add feature A");
  });

  bdd.it("returns multiple specs with activeSpec set", async () => {
    const root = await makeTempDir();
    await createSpec(root, "spec-1", "First");
    await createExecutingSpec(root, "spec-2");

    const state = await dashboardState.getState(root);

    assert.assertEquals(state.specs.length, 2);
    // activeSpec should be one of the non-IDLE/non-COMPLETED specs
    assert.assert(state.activeSpec !== null);
    assert.assert(
      state.activeSpec.phase !== "COMPLETED" &&
        state.activeSpec.phase !== "IDLE",
    );
  });

  bdd.it("includes recent events", async () => {
    const root = await makeTempDir();
    await events.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "spec-created",
      spec: "test",
      user: "tester",
    });

    const state = await dashboardState.getState(root);
    assert.assertEquals(state.recentEvents.length, 1);
    assert.assertEquals(state.recentEvents[0]!.type, "spec-created");
  });
});

// =============================================================================
// getSpecSummary
// =============================================================================

bdd.describe("dashboard.getSpecSummary", () => {
  bdd.it("returns correct summary for DISCOVERY spec", async () => {
    const root = await makeTempDir();
    await createSpec(root, "photo-upload", "Add photo upload");

    const summary = await dashboardState.getSpecSummary(root, "photo-upload");

    assert.assertEquals(summary.name, "photo-upload");
    assert.assertEquals(summary.phase, "DISCOVERY");
    assert.assertEquals(summary.description, "Add photo upload");
    assert.assert(summary.roadmap.includes("DISCOVERY"));
  });

  bdd.it("returns correct task status for EXECUTING spec", async () => {
    const root = await makeTempDir();
    await createExecutingSpec(root, "exec-spec");

    const summary = await dashboardState.getSpecSummary(root, "exec-spec");
    assert.assertEquals(summary.phase, "EXECUTING");
  });

  bdd.it(
    "reads the active state of a spec that has no state file",
    async () => {
      const root = await makeTempDir();
      const name = "active-only";
      await runtime.fs.mkdir(`${root}/${persistence.paths.specDir(name)}`, {
        recursive: true,
      });
      await persistence.writeState(
        root,
        machine.startSpec(
          schema.createInitialState(),
          name,
          `spec/${name}`,
          "Lives in state.json",
        ),
      );

      const summary = await dashboardState.getSpecSummary(root, name);

      assert.assertEquals(summary.phase, "DISCOVERY");
      assert.assertEquals(summary.description, "Lives in state.json");
    },
  );

  bdd.it("does not read the active state of another spec", async () => {
    const root = await makeTempDir();
    await runtime.fs.mkdir(`${root}/${persistence.paths.specDir("idle")}`, {
      recursive: true,
    });
    await persistence.writeState(
      root,
      machine.startSpec(
        schema.createInitialState(),
        "busy",
        "spec/busy",
        "Another spec",
      ),
    );

    const summary = await dashboardState.getSpecSummary(root, "idle");

    assert.assertEquals(summary.phase, "IDLE");
    assert.assertEquals(summary.description, "");
  });
});

// =============================================================================
// dashboard.approve
// =============================================================================

bdd.describe("dashboard.approve", () => {
  bdd.it(
    "transitions SPEC_PROPOSAL to SPEC_APPROVED and writes event",
    async () => {
      const root = await makeTempDir();
      let state = schema.createInitialState();
      state = machine.startSpec(
        state,
        "test-approve",
        "spec/test-approve",
        "test",
      );
      state = machine.completeDiscovery(state);
      state = machine.approveDiscoveryReview(state);
      // Now in SPEC_PROPOSAL

      await runtime.fs.mkdir(
        `${root}/${persistence.paths.specDir("test-approve")}`,
        { recursive: true },
      );
      await persistence.writeSpecState(root, "test-approve", state);

      const result = await actions.approve(root, "test-approve", {
        name: "Test User",
        email: "test@example.com",
      });

      assert.assertEquals(result.ok, true);

      // Verify state changed
      const updated = await persistence.readSpecState(root, "test-approve");
      assert.assertEquals(updated.phase, "SPEC_APPROVED");

      // Verify event written
      const evts = await events.readEvents(root);
      assert.assertEquals(evts.length, 1);
      assert.assertEquals(evts[0]!.type, "phase-change");
      assert.assertEquals(evts[0]!.spec, "test-approve");
    },
  );

  bdd.it("rejects approve from wrong phase", async () => {
    const root = await makeTempDir();
    await createSpec(root, "wrong-phase", "test");

    const result = await actions.approve(root, "wrong-phase");
    assert.assertEquals(result.ok, false);
    assert.assert(
      !result.ok && result.error.message.includes("Cannot approve"),
    );
  });
});

// =============================================================================
// dashboard.addNote
// =============================================================================

bdd.describe("dashboard.addNote", () => {
  bdd.it("adds note and writes event", async () => {
    const root = await makeTempDir();
    await createSpec(root, "noted-spec", "test");

    const result = await actions.addNote(
      root,
      "noted-spec",
      "Important observation",
      { name: "Reviewer", email: "r@test.com" },
    );

    assert.assertEquals(result.ok, true);

    // Verify event
    const evts = await events.readEvents(root);
    assert.assertEquals(evts.length, 1);
    assert.assertEquals(evts[0]!.type, "note");
    assert.assertEquals(
      (evts[0] as Record<string, unknown>)["text"],
      "Important observation",
    );
  });
});

// =============================================================================
// dashboard.addQuestion
// =============================================================================

bdd.describe("dashboard.addQuestion", () => {
  bdd.it("adds question note and writes mention event", async () => {
    const root = await makeTempDir();
    await createSpec(root, "question-spec", "test");

    const result = await actions.addQuestion(
      root,
      "question-spec",
      "Should we use PostgreSQL?",
      { name: "Dev", email: "d@test.com" },
    );

    assert.assertEquals(result.ok, true);

    // Verify mention event
    const evts = await events.readEvents(root);
    assert.assertEquals(evts.length, 1);
    assert.assertEquals(evts[0]!.type, "mention");
  });
});

// =============================================================================
// dashboard.replyMention
// =============================================================================

bdd.describe("dashboard.replyMention", () => {
  bdd.it("adds reply and writes mention-reply event", async () => {
    const root = await makeTempDir();
    await createSpec(root, "reply-spec", "test");

    const result = await actions.replyMention(
      root,
      "reply-spec",
      "mention-123",
      "Yes, use PostgreSQL",
      { name: "Lead", email: "l@test.com" },
    );

    assert.assertEquals(result.ok, true);

    const evts = await events.readEvents(root);
    assert.assertEquals(evts.length, 1);
    assert.assertEquals(evts[0]!.type, "mention-reply");
    assert.assertEquals(
      (evts[0] as Record<string, unknown>)["mentionId"],
      "mention-123",
    );
  });
});

// =============================================================================
// dashboard.signoff
// =============================================================================

bdd.describe("dashboard.signoff", () => {
  bdd.it("writes signoff event", async () => {
    const root = await makeTempDir();

    const result = await actions.signoff(root, "any-spec", {
      name: "Manager",
      email: "m@test.com",
    });

    assert.assertEquals(result.ok, true);

    const evts = await events.readEvents(root);
    assert.assertEquals(evts.length, 1);
    assert.assertEquals(evts[0]!.type, "signoff");
    assert.assertEquals(
      (evts[0] as Record<string, unknown>)["role"],
      "reviewer",
    );
  });
});

// =============================================================================
// Roles — null = everything allowed
// =============================================================================

bdd.describe("roles", () => {
  bdd.it("null roles means everything allowed", async () => {
    const root = await makeTempDir();
    const state = await dashboardState.getState(root);

    assert.assertEquals(state.roles, null);
    // All actions should work without role config
  });
});
