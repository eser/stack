// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";

// =============================================================================
// Helpers
// =============================================================================

const idle = (): schema.StateFile => schema.createInitialState();

const inDiscovery = (): schema.StateFile =>
  machine.startSpec(idle(), "test-spec", "spec/test-spec");

const withAnswers = (
  state: schema.StateFile,
  count: number,
): schema.StateFile => {
  let s = state;
  for (let i = 0; i < count; i++) {
    s = machine.addDiscoveryAnswer(
      s,
      `q${i}`,
      `answer-${i} with enough detail to pass validation`,
    );
  }
  return s;
};

const inDiscoveryReview = (): schema.StateFile =>
  machine.completeDiscovery(inDiscovery());

const inSpecDraft = (): schema.StateFile =>
  machine.approveDiscoveryReview(inDiscoveryReview());

const inSpecApproved = (): schema.StateFile =>
  machine.approveSpec(inSpecDraft());

const inExecuting = (): schema.StateFile =>
  machine.startExecution(inSpecApproved());

const inBlocked = (): schema.StateFile =>
  machine.blockExecution(inExecuting(), "need decision");

// =============================================================================
// canTransition
// =============================================================================

describe("canTransition", () => {
  it("allows valid transitions", () => {
    assertEquals(machine.canTransition("UNINITIALIZED", "IDLE"), true);
    assertEquals(machine.canTransition("IDLE", "DISCOVERY"), true);
    assertEquals(machine.canTransition("DISCOVERY", "DISCOVERY_REVIEW"), true);
    assertEquals(machine.canTransition("DISCOVERY_REVIEW", "SPEC_DRAFT"), true);
    assertEquals(machine.canTransition("SPEC_DRAFT", "SPEC_APPROVED"), true);
    assertEquals(machine.canTransition("SPEC_APPROVED", "EXECUTING"), true);
    assertEquals(machine.canTransition("EXECUTING", "COMPLETED"), true);
    assertEquals(machine.canTransition("EXECUTING", "BLOCKED"), true);
    assertEquals(machine.canTransition("BLOCKED", "EXECUTING"), true);
    assertEquals(machine.canTransition("COMPLETED", "IDLE"), true);
    assertEquals(machine.canTransition("COMPLETED", "DISCOVERY"), true);
  });

  it("rejects invalid transitions", () => {
    assertEquals(machine.canTransition("DISCOVERY", "EXECUTING"), false);
    assertEquals(machine.canTransition("DISCOVERY", "SPEC_DRAFT"), false);
    assertEquals(machine.canTransition("EXECUTING", "IDLE"), false);
    assertEquals(machine.canTransition("SPEC_DRAFT", "EXECUTING"), false);
    assertEquals(machine.canTransition("SPEC_APPROVED", "IDLE"), false);
  });
});

// =============================================================================
// assertTransition
// =============================================================================

describe("assertTransition", () => {
  it("throws on invalid transition with descriptive message", () => {
    assertThrows(
      () => machine.assertTransition("IDLE", "EXECUTING"),
      Error,
      "Invalid phase transition: IDLE → EXECUTING",
    );
  });

  it("does not throw on valid transition", () => {
    machine.assertTransition("IDLE", "DISCOVERY");
  });
});

// =============================================================================
// startSpec
// =============================================================================

describe("startSpec", () => {
  it("transitions IDLE → DISCOVERY with spec name and branch", () => {
    const state = machine.startSpec(idle(), "my-feature", "spec/my-feature");

    assertEquals(state.phase, "DISCOVERY");
    assertEquals(state.spec, "my-feature");
    assertEquals(state.branch, "spec/my-feature");
  });

  it("resets discovery, execution, and decisions", () => {
    const state = machine.startSpec(idle(), "fresh", "spec/fresh");

    assertEquals(state.discovery.answers.length, 0);
    assertEquals(state.discovery.completed, false);
    assertEquals(state.execution.iteration, 0);
    assertEquals(state.execution.lastProgress, null);
    assertEquals(state.decisions.length, 0);
  });

  it("throws from non-IDLE phases", () => {
    assertThrows(
      () => machine.startSpec(inDiscovery(), "x", "spec/x"),
      Error,
    );
    assertThrows(
      () => machine.startSpec(inExecuting(), "x", "spec/x"),
      Error,
    );
  });
});

// =============================================================================
// addDiscoveryAnswer
// =============================================================================

describe("addDiscoveryAnswer", () => {
  it("appends answer to discovery answers", () => {
    const state = machine.addDiscoveryAnswer(
      inDiscovery(),
      "status_quo",
      "users currently do X and need better tooling",
    );

    assertEquals(state.discovery.answers.length, 1);
    assertEquals(state.discovery.answers[0]?.questionId, "status_quo");
    assertEquals(
      state.discovery.answers[0]?.answer,
      "users currently do X and need better tooling",
    );
  });

  it("dedupes by questionId on re-answer", () => {
    let state = machine.addDiscoveryAnswer(
      inDiscovery(),
      "status_quo",
      "first answer with enough detail",
    );
    state = machine.addDiscoveryAnswer(
      state,
      "status_quo",
      "updated answer with more detail",
    );

    assertEquals(state.discovery.answers.length, 1);
    assertEquals(
      state.discovery.answers[0]?.answer,
      "updated answer with more detail",
    );
  });

  it("throws if not in DISCOVERY phase", () => {
    assertThrows(
      () =>
        machine.addDiscoveryAnswer(
          idle(),
          "q1",
          "a meaningful answer here",
        ),
      Error,
      "Cannot add discovery answer in phase: IDLE",
    );
  });

  it("rejects short answers (Jidoka: I1)", () => {
    assertThrows(
      () => machine.addDiscoveryAnswer(inDiscovery(), "q1", "yes"),
      Error,
      "Answer too short",
    );
    assertThrows(
      () => machine.addDiscoveryAnswer(inDiscovery(), "q1", "   short   "),
      Error,
      "Answer too short",
    );
  });
});

// =============================================================================
// completeDiscovery
// =============================================================================

describe("completeDiscovery", () => {
  it("transitions to DISCOVERY_REVIEW and sets completed", () => {
    const state = machine.completeDiscovery(inDiscovery());

    assertEquals(state.phase, "DISCOVERY_REVIEW");
    assertEquals(state.discovery.completed, true);
  });

  it("sets specState to draft with path", () => {
    const state = machine.completeDiscovery(inDiscovery());

    assertEquals(state.specState.status, "draft");
    assertEquals(state.specState.path, ".eser/specs/test-spec/spec.md");
  });

  it("throws if not in DISCOVERY", () => {
    assertThrows(
      () => machine.completeDiscovery(idle()),
      Error,
      "Cannot complete discovery in phase: IDLE",
    );
  });
});

// =============================================================================
// approveDiscoveryReview
// =============================================================================

describe("approveDiscoveryReview", () => {
  it("transitions DISCOVERY_REVIEW to SPEC_DRAFT", () => {
    const state = machine.approveDiscoveryReview(inDiscoveryReview());

    assertEquals(state.phase, "SPEC_DRAFT");
  });

  it("throws if not in DISCOVERY_REVIEW", () => {
    assertThrows(
      () => machine.approveDiscoveryReview(idle()),
      Error,
    );
  });
});

// =============================================================================
// advanceDiscoveryQuestion
// =============================================================================

describe("advanceDiscoveryQuestion", () => {
  it("increments currentQuestion", () => {
    const state = machine.advanceDiscoveryQuestion(inDiscovery());

    assertEquals(state.discovery.currentQuestion, 1);
  });

  it("throws if not in DISCOVERY", () => {
    assertThrows(
      () => machine.advanceDiscoveryQuestion(idle()),
      Error,
      "Cannot advance discovery question in phase: IDLE",
    );
  });
});

// =============================================================================
// approveSpec
// =============================================================================

describe("approveSpec", () => {
  it("transitions SPEC_DRAFT → SPEC_APPROVED", () => {
    const state = machine.approveSpec(inSpecDraft());

    assertEquals(state.phase, "SPEC_APPROVED");
  });

  it("sets specState status to approved", () => {
    const state = machine.approveSpec(inSpecDraft());

    assertEquals(state.specState.status, "approved");
  });

  it("throws from wrong phase", () => {
    assertThrows(() => machine.approveSpec(idle()), Error);
    assertThrows(() => machine.approveSpec(inDiscovery()), Error);
  });
});

// =============================================================================
// startExecution
// =============================================================================

describe("startExecution", () => {
  it("transitions SPEC_APPROVED → EXECUTING", () => {
    const state = machine.startExecution(inSpecApproved());

    assertEquals(state.phase, "EXECUTING");
  });

  it("resets execution state", () => {
    const state = machine.startExecution(inSpecApproved());

    assertEquals(state.execution.iteration, 0);
    assertEquals(state.execution.lastProgress, null);
  });

  it("throws from wrong phase", () => {
    assertThrows(() => machine.startExecution(idle()), Error);
    assertThrows(() => machine.startExecution(inSpecDraft()), Error);
  });
});

// =============================================================================
// advanceExecution
// =============================================================================

describe("advanceExecution", () => {
  it("increments iteration counter", () => {
    const state = machine.advanceExecution(inExecuting(), "step 1 done");

    assertEquals(state.execution.iteration, 1);
  });

  it("stores lastProgress message", () => {
    const state = machine.advanceExecution(inExecuting(), "implemented auth");

    assertEquals(state.execution.lastProgress, "implemented auth");
  });

  it("increments cumulatively", () => {
    let state = machine.advanceExecution(inExecuting(), "step 1");
    state = machine.advanceExecution(state, "step 2");

    assertEquals(state.execution.iteration, 2);
    assertEquals(state.execution.lastProgress, "step 2");
  });

  it("throws if not in EXECUTING", () => {
    assertThrows(
      () => machine.advanceExecution(idle(), "x"),
      Error,
      "Cannot advance execution in phase: IDLE",
    );
  });
});

// =============================================================================
// blockExecution
// =============================================================================

describe("blockExecution", () => {
  it("transitions EXECUTING → BLOCKED", () => {
    const state = machine.blockExecution(inExecuting(), "need API key");

    assertEquals(state.phase, "BLOCKED");
  });

  it("stores reason in lastProgress with BLOCKED prefix", () => {
    const state = machine.blockExecution(inExecuting(), "need API key");

    assertEquals(state.execution.lastProgress, "BLOCKED: need API key");
  });

  it("throws from non-EXECUTING phase", () => {
    assertThrows(() => machine.blockExecution(idle(), "x"), Error);
  });
});

// =============================================================================
// addDecision
// =============================================================================

describe("addDecision", () => {
  it("appends decision to decisions array", () => {
    const decision: schema.Decision = {
      id: "d1",
      question: "Which DB?",
      choice: "PostgreSQL",
      promoted: false,
      timestamp: "2026-03-27T10:00:00Z",
    };
    const state = machine.addDecision(idle(), decision);

    assertEquals(state.decisions.length, 1);
    assertEquals(state.decisions[0]?.choice, "PostgreSQL");
  });

  it("works in any phase (decisions are cross-cutting)", () => {
    const decision: schema.Decision = {
      id: "d1",
      question: "q",
      choice: "c",
      promoted: false,
      timestamp: "2026-03-27T10:00:00Z",
    };

    assertEquals(machine.addDecision(idle(), decision).decisions.length, 1);
    assertEquals(
      machine.addDecision(inDiscovery(), decision).decisions.length,
      1,
    );
    assertEquals(
      machine.addDecision(inExecuting(), decision).decisions.length,
      1,
    );
  });
});

// =============================================================================
// resetToIdle
// =============================================================================

describe("resetToIdle", () => {
  it("clears all fields and sets phase to IDLE", () => {
    const state = machine.resetToIdle(inExecuting());

    assertEquals(state.phase, "IDLE");
    assertEquals(state.spec, null);
    assertEquals(state.branch, null);
    assertEquals(state.discovery.answers.length, 0);
    assertEquals(state.discovery.completed, false);
    assertEquals(state.execution.iteration, 0);
    assertEquals(state.decisions.length, 0);
  });

  it("preserves version field", () => {
    const original = inExecuting();
    const state = machine.resetToIdle(original);

    assertEquals(state.version, original.version);
  });

  it("allows reset from IDLE, EXECUTING, BLOCKED, COMPLETED (Jidoka I7)", () => {
    // IDLE → IDLE (noop but allowed)
    assertEquals(machine.resetToIdle(idle()).phase, "IDLE");
    // EXECUTING → IDLE
    assertEquals(machine.resetToIdle(inExecuting()).phase, "IDLE");
    // BLOCKED → IDLE
    assertEquals(machine.resetToIdle(inBlocked()).phase, "IDLE");
    // COMPLETED → IDLE
    const completed = machine.completeSpec(inExecuting(), "done");
    assertEquals(machine.resetToIdle(completed).phase, "IDLE");
  });

  it("rejects reset from DISCOVERY, DISCOVERY_REVIEW, SPEC_DRAFT, SPEC_APPROVED (Jidoka I7)", () => {
    assertThrows(
      () => machine.resetToIdle(inDiscovery()),
      Error,
      "Cannot reset from DISCOVERY",
    );
    assertThrows(
      () => machine.resetToIdle(inDiscoveryReview()),
      Error,
      "Cannot reset from DISCOVERY_REVIEW",
    );
    assertThrows(
      () => machine.resetToIdle(inSpecDraft()),
      Error,
      "Cannot reset from SPEC_DRAFT",
    );
    assertThrows(
      () => machine.resetToIdle(inSpecApproved()),
      Error,
      "Cannot reset from SPEC_APPROVED",
    );
  });
});

// =============================================================================
// withAnswers helper
// =============================================================================

describe("withAnswers helper", () => {
  it("adds N answers to discovery state", () => {
    const state = withAnswers(inDiscovery(), 3);

    assertEquals(state.discovery.answers.length, 3);
    assertEquals(state.discovery.answers[0]?.questionId, "q0");
    assertEquals(
      state.discovery.answers[2]?.answer,
      "answer-2 with enough detail to pass validation",
    );
  });
});

// =============================================================================
// BLOCKED round-trip
// =============================================================================

describe("BLOCKED round-trip", () => {
  it("block preserves iteration and resolving continues", () => {
    let state = inExecuting();
    state = machine.advanceExecution(state, "step 1");
    state = machine.advanceExecution(state, "step 2");

    const blocked = inBlocked();
    assertEquals(blocked.phase, "BLOCKED");

    const unblocked = machine.transition(blocked, "EXECUTING");
    assertEquals(unblocked.phase, "EXECUTING");
  });
});

// =============================================================================
// IDLE — default permissive state
// =============================================================================

describe("IDLE state", () => {
  it("createInitialState returns IDLE", () => {
    const state = schema.createInitialState();
    assertEquals(state.phase, "IDLE");
  });

  it("IDLE → DISCOVERY via startSpec", () => {
    const state = machine.startSpec(idle(), "test", "spec/test");
    assertEquals(state.phase, "DISCOVERY");
  });

  it("IDLE → COMPLETED via completeSpec", () => {
    const state = machine.completeSpec(idle(), "cancelled");
    assertEquals(state.phase, "COMPLETED");
  });

  it("canTransition IDLE → DISCOVERY", () => {
    assertEquals(machine.canTransition("IDLE", "DISCOVERY"), true);
  });

  it("canTransition IDLE → COMPLETED", () => {
    assertEquals(machine.canTransition("IDLE", "COMPLETED"), true);
  });

  it("rejects IDLE → EXECUTING (must go through spec lifecycle)", () => {
    assertEquals(machine.canTransition("IDLE", "EXECUTING"), false);
  });

  it("COMPLETED → IDLE (return to default after spec done)", () => {
    assertEquals(machine.canTransition("COMPLETED", "IDLE"), true);
  });
});

// =============================================================================
// completeSpec (cancel/wontfix from every phase)
// =============================================================================

describe("completeSpec: cancel from every spec phase", () => {
  it("cancel from DISCOVERY → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inDiscovery(), "cancelled");
    assertEquals(state.phase, "COMPLETED");
    assertEquals(state.completionReason, "cancelled");
  });

  it("cancel from DISCOVERY_REVIEW → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inDiscoveryReview(), "cancelled");
    assertEquals(state.phase, "COMPLETED");
    assertEquals(state.completionReason, "cancelled");
  });

  it("cancel from SPEC_DRAFT → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inSpecDraft(), "cancelled");
    assertEquals(state.phase, "COMPLETED");
    assertEquals(state.completionReason, "cancelled");
  });

  it("cancel from SPEC_APPROVED → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inSpecApproved(), "cancelled");
    assertEquals(state.phase, "COMPLETED");
    assertEquals(state.completionReason, "cancelled");
  });

  it("cancel from EXECUTING → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inExecuting(), "cancelled");
    assertEquals(state.phase, "COMPLETED");
    assertEquals(state.completionReason, "cancelled");
  });

  it("cancel from BLOCKED → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inBlocked(), "cancelled");
    assertEquals(state.phase, "COMPLETED");
    assertEquals(state.completionReason, "cancelled");
  });
});

describe("completeSpec: wontfix from spec phases", () => {
  it("wontfix from DISCOVERY → COMPLETED(wontfix) with note", () => {
    const state = machine.completeSpec(
      inDiscovery(),
      "wontfix",
      "resolved itself",
    );
    assertEquals(state.phase, "COMPLETED");
    assertEquals(state.completionReason, "wontfix");
    assertEquals(state.completionNote, "resolved itself");
  });

  it("wontfix from EXECUTING → COMPLETED(wontfix) with note", () => {
    const state = machine.completeSpec(
      inExecuting(),
      "wontfix",
      "no longer relevant",
    );
    assertEquals(state.phase, "COMPLETED");
    assertEquals(state.completionReason, "wontfix");
    assertEquals(state.completionNote, "no longer relevant");
  });
});

describe("completeSpec: COMPLETED rejects re-completion", () => {
  it("cancel from COMPLETED → throws (no self-transition)", () => {
    const completed = machine.completeSpec(inExecuting(), "done");
    assertThrows(
      () => machine.completeSpec(completed, "cancelled"),
      Error,
      "Invalid phase transition: COMPLETED → COMPLETED",
    );
  });

  it("wontfix from COMPLETED → throws (no self-transition)", () => {
    const completed = machine.completeSpec(inExecuting(), "done");
    assertThrows(
      () => machine.completeSpec(completed, "wontfix", "reason"),
      Error,
      "Invalid phase transition: COMPLETED → COMPLETED",
    );
  });
});

describe("completeSpec: command-level guards (IDLE)", () => {
  // IDLE → COMPLETED is a valid machine transition
  it("machine allows IDLE → COMPLETED", () => {
    const state = machine.completeSpec(idle(), "cancelled");
    assertEquals(state.phase, "COMPLETED");
  });
});

// =============================================================================
// Jidoka I2: follow-up blocking
// =============================================================================

describe("completeDiscovery follow-up blocking (Jidoka I2)", () => {
  it("blocks completion when pending follow-ups exist", () => {
    let state = inDiscovery();
    state = machine.addFollowUp(state, "q1", "What about edge cases?", "agent");

    assertThrows(
      () => machine.completeDiscovery(state),
      Error,
      "pending follow-up",
    );
  });

  it("allows completion when follow-ups are answered", () => {
    let state = inDiscovery();
    state = machine.addFollowUp(state, "q1", "What about edge cases?", "agent");
    state = machine.answerFollowUp(
      state,
      "q1a",
      "Edge cases handled by validation layer",
    );

    const completed = machine.completeDiscovery(state);
    assertEquals(completed.phase, "DISCOVERY_REVIEW");
  });

  it("allows completion when follow-ups are skipped", () => {
    let state = inDiscovery();
    state = machine.addFollowUp(state, "q1", "What about edge cases?", "agent");
    state = machine.skipFollowUp(state, "q1a");

    const completed = machine.completeDiscovery(state);
    assertEquals(completed.phase, "DISCOVERY_REVIEW");
  });

  it("allows completion with no follow-ups", () => {
    const state = inDiscovery();
    const completed = machine.completeDiscovery(state);
    assertEquals(completed.phase, "DISCOVERY_REVIEW");
  });
});

// =============================================================================
// Jidoka M2: confidence basis validation
// =============================================================================

describe("addConfidenceFinding basis validation (Jidoka M2)", () => {
  it("rejects high confidence without basis", () => {
    assertThrows(
      () => machine.addConfidenceFinding(inExecuting(), "claim", 8, ""),
      Error,
      "High confidence",
    );
    assertThrows(
      () => machine.addConfidenceFinding(inExecuting(), "claim", 9, "short"),
      Error,
      "High confidence",
    );
  });

  it("accepts high confidence with proper basis", () => {
    const state = machine.addConfidenceFinding(
      inExecuting(),
      "Upload handler lacks validation",
      9,
      "Read upload.ts:45 — no size check present",
    );
    assertEquals((state.execution.confidenceFindings ?? []).length, 1);
  });

  it("accepts low confidence without basis", () => {
    const state = machine.addConfidenceFinding(
      inExecuting(),
      "Might be slow",
      3,
      "",
    );
    assertEquals((state.execution.confidenceFindings ?? []).length, 1);
  });
});
