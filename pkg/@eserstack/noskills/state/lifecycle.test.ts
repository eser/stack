// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Section 1: Full Phase Lifecycle (End-to-End)
 * Tests the complete flow: Onboard → Decide → Spec → Execute.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";
import * as questions from "../context/questions.ts";

// =============================================================================
// Helpers
// =============================================================================

const idle = (): schema.StateFile => schema.createInitialState();

/** Walk all 6 discovery questions with unique answers */
const answerAllQuestions = (state: schema.StateFile): schema.StateFile => {
  const qs = questions.QUESTIONS;
  let s = state;
  for (const q of qs) {
    s = machine.addDiscoveryAnswer(
      s,
      q.id,
      `detailed answer for question ${q.id}`,
    );
  }
  return s;
};

// =============================================================================
// 1.1 Happy path: IDLE through COMPLETED
// =============================================================================

describe("Full lifecycle: IDLE → COMPLETED", () => {
  it("walks the complete happy path", () => {
    let state = idle();

    // IDLE → DISCOVERY
    state = machine.startSpec(state, "photo-upload", "spec/photo-upload");
    assertEquals(state.phase, "DISCOVERY");
    assertEquals(state.spec, "photo-upload");

    // Answer all 6 questions
    state = answerAllQuestions(state);
    assertEquals(state.discovery.answers.length, 6);

    // DISCOVERY → DISCOVERY_REFINEMENT
    state = machine.completeDiscovery(state);
    assertEquals(state.phase, "DISCOVERY_REFINEMENT");
    assertEquals(state.discovery.completed, true);

    // DISCOVERY_REFINEMENT → SPEC_PROPOSAL
    state = machine.approveDiscoveryReview(state);
    assertEquals(state.phase, "SPEC_PROPOSAL");
    assertEquals(state.specState.status, "draft");

    // SPEC_PROPOSAL → SPEC_APPROVED
    state = machine.approveSpec(state);
    assertEquals(state.phase, "SPEC_APPROVED");
    assertEquals(state.specState.status, "approved");

    // SPEC_APPROVED → EXECUTING
    state = machine.startExecution(state);
    assertEquals(state.phase, "EXECUTING");
    assertEquals(state.execution.iteration, 0);

    // Advance through 3 iterations
    state = machine.advanceExecution(state, "task 1 done");
    state = machine.advanceExecution(state, "task 2 done");
    state = machine.advanceExecution(state, "task 3 done");
    assertEquals(state.execution.iteration, 3);

    // Add a decision along the way
    state = machine.addDecision(state, {
      id: "d1",
      question: "Which storage?",
      choice: "S3",
      promoted: false,
      timestamp: "2026-03-27T10:00:00Z",
    });

    // EXECUTING → COMPLETED
    state = machine.transition(state, "COMPLETED");
    assertEquals(state.phase, "COMPLETED");
    assertEquals(state.execution.iteration, 3);
    assertEquals(state.decisions.length, 1);
    assertEquals(state.spec, "photo-upload");
  });
});

// =============================================================================
// 1.2 All discovery answers preserved in state
// =============================================================================

describe("Discovery answers preserved", () => {
  it("all 6 answers with specific text are retained after completeDiscovery", () => {
    let state = machine.startSpec(idle(), "test", "spec/test");

    const qs = questions.QUESTIONS;
    for (const q of qs) {
      state = machine.addDiscoveryAnswer(
        state,
        q.id,
        `specific answer for ${q.id}`,
      );
    }

    state = machine.completeDiscovery(state);

    // All 6 present
    assertEquals(state.discovery.answers.length, 6);

    // Each has its specific text
    for (const q of qs) {
      const answer = state.discovery.answers.find(
        (a) => a.questionId === q.id,
      );
      assertEquals(answer?.answer, `specific answer for ${q.id}`);
    }
  });
});

// =============================================================================
// 1.3 Lifecycle with blocks and resolutions
// =============================================================================

describe("Lifecycle with BLOCKED state", () => {
  it("iteration counter continues after unblock", () => {
    let state = idle();

    state = machine.startSpec(state, "api", "spec/api");
    state = answerAllQuestions(state);
    state = machine.completeDiscovery(state);
    state = machine.approveDiscoveryReview(state);
    state = machine.approveSpec(state);
    state = machine.startExecution(state);

    // Work 2 iterations
    state = machine.advanceExecution(state, "task 1");
    state = machine.advanceExecution(state, "task 2");
    assertEquals(state.execution.iteration, 2);

    // Hit a block
    state = machine.blockExecution(state, "need API key decision");
    assertEquals(state.phase, "BLOCKED");

    // Resolve block
    state = machine.transition(state, "EXECUTING");
    assertEquals(state.phase, "EXECUTING");

    // Iteration preserved — doesn't reset
    assertEquals(state.execution.iteration, 2);

    // Continue working
    state = machine.advanceExecution(state, "task 3");
    assertEquals(state.execution.iteration, 3);

    // Complete
    state = machine.transition(state, "COMPLETED");
    assertEquals(state.phase, "COMPLETED");
    assertEquals(state.execution.iteration, 3);
  });
});

// =============================================================================
// 1.4 Reset mid-workflow clears everything
// =============================================================================

describe("Reset mid-workflow", () => {
  it("clears ALL state including debt and decisions", () => {
    let state = idle();

    state = machine.startSpec(state, "feature", "spec/feature");
    state = answerAllQuestions(state);
    state = machine.completeDiscovery(state);
    state = machine.approveDiscoveryReview(state);
    state = machine.approveSpec(state);
    state = machine.startExecution(state);

    // Accumulate state
    state = machine.advanceExecution(state, "progress 1");
    state = machine.advanceExecution(state, "progress 2");
    state = machine.advanceExecution(state, "progress 3");
    state = machine.addDecision(state, {
      id: "d1",
      question: "q",
      choice: "c",
      promoted: true,
      timestamp: "2026-03-27T10:00:00Z",
    });

    // Manually set debt to simulate status report
    state = {
      ...state,
      execution: {
        ...state.execution,
        debt: {
          items: [{ id: "debt-1", text: "leftover task", since: 2 }],
          fromIteration: 2,
          unaddressedIterations: 1,
        },
      },
    };

    // Reset
    state = machine.resetToIdle(state);

    assertEquals(state.phase, "IDLE");
    assertEquals(state.spec, null);
    assertEquals(state.branch, null);
    assertEquals(state.discovery.answers.length, 0);
    assertEquals(state.discovery.completed, false);
    assertEquals(state.execution.iteration, 0);
    assertEquals(state.execution.lastProgress, null);
    assertEquals(state.execution.modifiedFiles.length, 0);
    assertEquals(state.execution.debt, null);
    assertEquals(state.execution.awaitingStatusReport, false);
    assertEquals(state.decisions.length, 0);
  });
});

// =============================================================================
// Section 2.3: Agent cannot force transitions
// =============================================================================

describe("Invalid transition shortcuts blocked", () => {
  it("cannot skip from DISCOVERY to EXECUTING", () => {
    const state = machine.startSpec(idle(), "x", "spec/x");
    assertThrows(() => machine.startExecution(state), Error);
  });

  it("cannot approve from DISCOVERY", () => {
    const state = machine.startSpec(idle(), "x", "spec/x");
    assertThrows(() => machine.approveSpec(state), Error);
  });

  it("cannot advanceExecution from DISCOVERY_REFINEMENT", () => {
    let state = machine.startSpec(idle(), "x", "spec/x");
    state = machine.completeDiscovery(state);
    assertThrows(() => machine.advanceExecution(state, "x"), Error);
  });

  it("cannot start new spec while EXECUTING", () => {
    let state = machine.startSpec(idle(), "x", "spec/x");
    state = answerAllQuestions(state);
    state = machine.completeDiscovery(state);
    state = machine.approveDiscoveryReview(state);
    state = machine.approveSpec(state);
    state = machine.startExecution(state);
    assertThrows(() => machine.startSpec(state, "y", "spec/y"), Error);
  });

  it("cannot block from DISCOVERY", () => {
    const state = machine.startSpec(idle(), "x", "spec/x");
    assertThrows(() => machine.blockExecution(state, "reason"), Error);
  });
});
