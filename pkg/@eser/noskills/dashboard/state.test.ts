// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import * as dashboardState from "./state.ts";
import * as actions from "./actions.ts";
import * as events from "./events.ts";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as persistence from "../state/persistence.ts";
import { runtime } from "@eser/standards/cross-runtime";

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

describe("dashboard.getState", () => {
  it("returns empty specs when no specs exist", async () => {
    const root = await makeTempDir();
    const state = await dashboardState.getState(root);

    assertEquals(state.specs.length, 0);
    assertEquals(state.activeSpec, null);
    assertEquals(state.recentEvents.length, 0);
  });

  it("returns specs with correct phase", async () => {
    const root = await makeTempDir();
    await createSpec(root, "feature-a", "Add feature A");

    const state = await dashboardState.getState(root);

    assertEquals(state.specs.length, 1);
    assertEquals(state.specs[0]!.name, "feature-a");
    assertEquals(state.specs[0]!.phase, "DISCOVERY");
    assertEquals(state.specs[0]!.description, "Add feature A");
  });

  it("returns multiple specs with activeSpec set", async () => {
    const root = await makeTempDir();
    await createSpec(root, "spec-1", "First");
    await createExecutingSpec(root, "spec-2");

    const state = await dashboardState.getState(root);

    assertEquals(state.specs.length, 2);
    // activeSpec should be one of the non-IDLE/non-COMPLETED specs
    assert(state.activeSpec !== null);
    assert(
      state.activeSpec.phase !== "COMPLETED" &&
        state.activeSpec.phase !== "IDLE",
    );
  });

  it("includes recent events", async () => {
    const root = await makeTempDir();
    await events.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "spec-created",
      spec: "test",
      user: "tester",
    });

    const state = await dashboardState.getState(root);
    assertEquals(state.recentEvents.length, 1);
    assertEquals(state.recentEvents[0]!.type, "spec-created");
  });
});

// =============================================================================
// getSpecSummary
// =============================================================================

describe("dashboard.getSpecSummary", () => {
  it("returns correct summary for DISCOVERY spec", async () => {
    const root = await makeTempDir();
    await createSpec(root, "photo-upload", "Add photo upload");

    const summary = await dashboardState.getSpecSummary(root, "photo-upload");

    assertEquals(summary.name, "photo-upload");
    assertEquals(summary.phase, "DISCOVERY");
    assertEquals(summary.description, "Add photo upload");
    assert(summary.roadmap.includes("DISCOVERY"));
  });

  it("returns correct task status for EXECUTING spec", async () => {
    const root = await makeTempDir();
    await createExecutingSpec(root, "exec-spec");

    const summary = await dashboardState.getSpecSummary(root, "exec-spec");
    assertEquals(summary.phase, "EXECUTING");
  });
});

// =============================================================================
// dashboard.approve
// =============================================================================

describe("dashboard.approve", () => {
  it("transitions SPEC_DRAFT to SPEC_APPROVED and writes event", async () => {
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
    // Now in SPEC_DRAFT

    await runtime.fs.mkdir(
      `${root}/${persistence.paths.specDir("test-approve")}`,
      { recursive: true },
    );
    await persistence.writeSpecState(root, "test-approve", state);

    const result = await actions.approve(root, "test-approve", {
      name: "Test User",
      email: "test@example.com",
    });

    assertEquals(result.ok, true);

    // Verify state changed
    const updated = await persistence.readSpecState(root, "test-approve");
    assertEquals(updated.phase, "SPEC_APPROVED");

    // Verify event written
    const evts = await events.readEvents(root);
    assertEquals(evts.length, 1);
    assertEquals(evts[0]!.type, "phase-change");
    assertEquals(evts[0]!.spec, "test-approve");
  });

  it("rejects approve from wrong phase", async () => {
    const root = await makeTempDir();
    await createSpec(root, "wrong-phase", "test");

    const result = await actions.approve(root, "wrong-phase");
    assertEquals(result.ok, false);
    assert(!result.ok && result.error.includes("Cannot approve"));
  });
});

// =============================================================================
// dashboard.addNote
// =============================================================================

describe("dashboard.addNote", () => {
  it("adds note and writes event", async () => {
    const root = await makeTempDir();
    await createSpec(root, "noted-spec", "test");

    const result = await actions.addNote(
      root,
      "noted-spec",
      "Important observation",
      { name: "Reviewer", email: "r@test.com" },
    );

    assertEquals(result.ok, true);

    // Verify event
    const evts = await events.readEvents(root);
    assertEquals(evts.length, 1);
    assertEquals(evts[0]!.type, "note");
    assertEquals(
      (evts[0] as Record<string, unknown>)["text"],
      "Important observation",
    );
  });
});

// =============================================================================
// dashboard.addQuestion
// =============================================================================

describe("dashboard.addQuestion", () => {
  it("adds question note and writes mention event", async () => {
    const root = await makeTempDir();
    await createSpec(root, "question-spec", "test");

    const result = await actions.addQuestion(
      root,
      "question-spec",
      "Should we use PostgreSQL?",
      { name: "Dev", email: "d@test.com" },
    );

    assertEquals(result.ok, true);

    // Verify mention event
    const evts = await events.readEvents(root);
    assertEquals(evts.length, 1);
    assertEquals(evts[0]!.type, "mention");
  });
});

// =============================================================================
// dashboard.replyMention
// =============================================================================

describe("dashboard.replyMention", () => {
  it("adds reply and writes mention-reply event", async () => {
    const root = await makeTempDir();
    await createSpec(root, "reply-spec", "test");

    const result = await actions.replyMention(
      root,
      "reply-spec",
      "mention-123",
      "Yes, use PostgreSQL",
      { name: "Lead", email: "l@test.com" },
    );

    assertEquals(result.ok, true);

    const evts = await events.readEvents(root);
    assertEquals(evts.length, 1);
    assertEquals(evts[0]!.type, "mention-reply");
    assertEquals(
      (evts[0] as Record<string, unknown>)["mentionId"],
      "mention-123",
    );
  });
});

// =============================================================================
// dashboard.signoff
// =============================================================================

describe("dashboard.signoff", () => {
  it("writes signoff event", async () => {
    const root = await makeTempDir();

    const result = await actions.signoff(root, "any-spec", {
      name: "Manager",
      email: "m@test.com",
    });

    assertEquals(result.ok, true);

    const evts = await events.readEvents(root);
    assertEquals(evts.length, 1);
    assertEquals(evts[0]!.type, "signoff");
    assertEquals((evts[0] as Record<string, unknown>)["role"], "reviewer");
  });
});

// =============================================================================
// Roles — null = everything allowed
// =============================================================================

describe("roles", () => {
  it("null roles means everything allowed", async () => {
    const root = await makeTempDir();
    const state = await dashboardState.getState(root);

    assertEquals(state.roles, null);
    // All actions should work without role config
  });
});
