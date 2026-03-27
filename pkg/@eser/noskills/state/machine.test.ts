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

const _withAnswers = (
  state: schema.StateFile,
  count: number,
): schema.StateFile => {
  let s = state;
  for (let i = 0; i < count; i++) {
    s = machine.addDiscoveryAnswer(s, `q${i}`, `answer-${i}`);
  }
  return s;
};

const inSpecDraft = (): schema.StateFile =>
  machine.completeDiscovery(inDiscovery());

const inSpecApproved = (): schema.StateFile =>
  machine.approveSpec(inSpecDraft());

const inExecuting = (): schema.StateFile =>
  machine.startExecution(inSpecApproved());

const _inBlocked = (): schema.StateFile =>
  machine.blockExecution(inExecuting(), "need decision");

// =============================================================================
// canTransition
// =============================================================================

describe("canTransition", () => {
  it("allows valid transitions", () => {
    assertEquals(machine.canTransition("UNINITIALIZED", "IDLE"), true);
    assertEquals(machine.canTransition("IDLE", "DISCOVERY"), true);
    assertEquals(machine.canTransition("DISCOVERY", "SPEC_DRAFT"), true);
    assertEquals(machine.canTransition("SPEC_DRAFT", "SPEC_APPROVED"), true);
    assertEquals(machine.canTransition("SPEC_APPROVED", "EXECUTING"), true);
    assertEquals(machine.canTransition("EXECUTING", "DONE"), true);
    assertEquals(machine.canTransition("EXECUTING", "BLOCKED"), true);
    assertEquals(machine.canTransition("BLOCKED", "EXECUTING"), true);
    assertEquals(machine.canTransition("DONE", "IDLE"), true);
  });

  it("rejects invalid transitions", () => {
    assertEquals(machine.canTransition("IDLE", "DONE"), false);
    assertEquals(machine.canTransition("DISCOVERY", "EXECUTING"), false);
    assertEquals(machine.canTransition("EXECUTING", "IDLE"), false);
    assertEquals(machine.canTransition("BLOCKED", "DONE"), false);
    assertEquals(machine.canTransition("DONE", "DISCOVERY"), false);
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
      () => machine.assertTransition("IDLE", "DONE"),
      Error,
      "Invalid phase transition: IDLE → DONE",
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
      "users do X",
    );

    assertEquals(state.discovery.answers.length, 1);
    assertEquals(state.discovery.answers[0]?.questionId, "status_quo");
    assertEquals(state.discovery.answers[0]?.answer, "users do X");
  });

  it("dedupes by questionId on re-answer", () => {
    let state = machine.addDiscoveryAnswer(
      inDiscovery(),
      "status_quo",
      "first",
    );
    state = machine.addDiscoveryAnswer(state, "status_quo", "updated");

    assertEquals(state.discovery.answers.length, 1);
    assertEquals(state.discovery.answers[0]?.answer, "updated");
  });

  it("throws if not in DISCOVERY phase", () => {
    assertThrows(
      () => machine.addDiscoveryAnswer(idle(), "q1", "a1"),
      Error,
      "Cannot add discovery answer in phase: IDLE",
    );
  });
});

// =============================================================================
// completeDiscovery
// =============================================================================

describe("completeDiscovery", () => {
  it("transitions to SPEC_DRAFT and sets completed", () => {
    const state = machine.completeDiscovery(inDiscovery());

    assertEquals(state.phase, "SPEC_DRAFT");
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
});
