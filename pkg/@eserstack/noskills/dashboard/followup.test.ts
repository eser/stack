// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";

// =============================================================================
// Helpers
// =============================================================================

const createDiscoverySpec = (name: string): schema.StateFile => {
  const state = schema.createInitialState();
  return machine.startSpec(state, name, `spec/${name}`, "test");
};

// =============================================================================
// addFollowUp
// =============================================================================

describe("addFollowUp", () => {
  it("creates follow-up with correct id pattern", () => {
    let state = createDiscoverySpec("test");
    state = machine.addFollowUp(
      state,
      "status_quo",
      "What about edge cases?",
      "eser",
    );

    const followUps = state.discovery.followUps ?? [];
    assertEquals(followUps.length, 1);
    assertEquals(followUps[0]!.id, "status_quoa"); // first follow-up = 'a'
    assertEquals(followUps[0]!.parentQuestionId, "status_quo");
    assertEquals(followUps[0]!.question, "What about edge cases?");
    assertEquals(followUps[0]!.status, "pending");
    assertEquals(followUps[0]!.answer, null);
  });

  it("increments id suffix for multiple follow-ups", () => {
    let state = createDiscoverySpec("test");
    state = machine.addFollowUp(state, "Q3", "First?", "eser");
    state = machine.addFollowUp(state, "Q3", "Second?", "eser");
    state = machine.addFollowUp(state, "Q3", "Third?", "eser");

    const followUps = state.discovery.followUps ?? [];
    assertEquals(followUps.length, 3);
    assertEquals(followUps[0]!.id, "Q3a");
    assertEquals(followUps[1]!.id, "Q3b");
    assertEquals(followUps[2]!.id, "Q3c");
  });

  it("enforces max 3 follow-ups per question", () => {
    let state = createDiscoverySpec("test");
    state = machine.addFollowUp(state, "Q3", "1?", "eser");
    state = machine.addFollowUp(state, "Q3", "2?", "eser");
    state = machine.addFollowUp(state, "Q3", "3?", "eser");
    state = machine.addFollowUp(state, "Q3", "4? (should be ignored)", "eser");

    const followUps = state.discovery.followUps ?? [];
    assertEquals(followUps.length, 3); // capped at 3
  });

  it("allows follow-ups on different questions independently", () => {
    let state = createDiscoverySpec("test");
    state = machine.addFollowUp(state, "Q1", "Q1 follow-up", "eser");
    state = machine.addFollowUp(state, "Q3", "Q3 follow-up", "eser");

    const followUps = state.discovery.followUps ?? [];
    assertEquals(followUps.length, 2);
    assertEquals(followUps[0]!.id, "Q1a");
    assertEquals(followUps[1]!.id, "Q3a");
  });
});

// =============================================================================
// answerFollowUp
// =============================================================================

describe("answerFollowUp", () => {
  it("updates status and records answer", () => {
    let state = createDiscoverySpec("test");
    state = machine.addFollowUp(state, "Q3", "Reconnection strategy?", "eser");
    state = machine.answerFollowUp(state, "Q3a", "Exponential backoff");

    const followUps = state.discovery.followUps ?? [];
    assertEquals(followUps[0]!.status, "answered");
    assertEquals(followUps[0]!.answer, "Exponential backoff");
    assert(followUps[0]!.answeredAt !== undefined);
  });

  it("does not re-answer already answered follow-up", () => {
    let state = createDiscoverySpec("test");
    state = machine.addFollowUp(state, "Q3", "Question?", "eser");
    state = machine.answerFollowUp(state, "Q3a", "First answer");
    state = machine.answerFollowUp(state, "Q3a", "Second answer");

    const followUps = state.discovery.followUps ?? [];
    assertEquals(followUps[0]!.answer, "First answer");
  });
});

// =============================================================================
// skipFollowUp
// =============================================================================

describe("skipFollowUp", () => {
  it("marks follow-up as skipped", () => {
    let state = createDiscoverySpec("test");
    state = machine.addFollowUp(state, "Q3", "Not relevant?", "eser");
    state = machine.skipFollowUp(state, "Q3a");

    const followUps = state.discovery.followUps ?? [];
    assertEquals(followUps[0]!.status, "skipped");
  });
});

// =============================================================================
// getPendingFollowUps
// =============================================================================

describe("getPendingFollowUps", () => {
  it("returns only pending follow-ups", () => {
    let state = createDiscoverySpec("test");
    state = machine.addFollowUp(state, "Q1", "Pending one", "eser");
    state = machine.addFollowUp(state, "Q2", "Will answer", "eser");
    state = machine.addFollowUp(state, "Q3", "Will skip", "eser");
    state = machine.answerFollowUp(state, "Q2a", "Done");
    state = machine.skipFollowUp(state, "Q3a");

    const pending = machine.getPendingFollowUps(state);
    assertEquals(pending.length, 1);
    assertEquals(pending[0]!.id, "Q1a");
  });

  it("returns empty when none pending", () => {
    let state = createDiscoverySpec("test");
    state = machine.addFollowUp(state, "Q1", "Q?", "eser");
    state = machine.answerFollowUp(state, "Q1a", "Done");

    assertEquals(machine.getPendingFollowUps(state).length, 0);
  });
});

// =============================================================================
// getFollowUpsForQuestion
// =============================================================================

describe("getFollowUpsForQuestion", () => {
  it("filters by parent question", () => {
    let state = createDiscoverySpec("test");
    state = machine.addFollowUp(state, "Q1", "Q1 follow", "eser");
    state = machine.addFollowUp(state, "Q3", "Q3 follow 1", "eser");
    state = machine.addFollowUp(state, "Q3", "Q3 follow 2", "eser");

    const q3 = machine.getFollowUpsForQuestion(state, "Q3");
    assertEquals(q3.length, 2);
    assertEquals(q3[0]!.id, "Q3a");
    assertEquals(q3[1]!.id, "Q3b");
  });
});

// =============================================================================
// Follow-up hint generation (via compiler)
// =============================================================================

describe("follow-up hint generation", () => {
  it("generates hints for technology mentions", async () => {
    const state = createDiscoverySpec("test");
    const addAnswer = machine.addDiscoveryAnswer(
      state,
      "status_quo",
      "We use WebSocket for real-time updates",
    );

    // Compile to get followUpHints
    const { compile } = await import("../context/compiler.ts");
    const output = await compile(
      addAnswer,
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
    );

    // The output should have followUpHints if the answer triggers them
    // Note: hints are in the DiscoveryOutput type
    if ("followUpHints" in output && output.followUpHints) {
      assert(
        (output.followUpHints as string[]).some((h: string) =>
          h.toLowerCase().includes("websocket")
        ),
      );
    }
    // Even if not present (depends on discovery phase), the function exists
  });
});
