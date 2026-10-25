// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Section 1: Full Phase Lifecycle (End-to-End)
 * Tests the complete flow: Onboard → Decide → Spec → Execute.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
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

bdd.describe("Full lifecycle: IDLE → COMPLETED", () => {
  bdd.it("walks the complete happy path", () => {
    let state = idle();

    // IDLE → DISCOVERY
    state = machine.startSpec(state, "photo-upload", "spec/photo-upload");
    assert.assertEquals(state.phase, "DISCOVERY");
    assert.assertEquals(state.spec, "photo-upload");

    // Answer all 6 questions
    state = answerAllQuestions(state);
    assert.assertEquals(state.discovery.answers.length, 6);

    // DISCOVERY → DISCOVERY_REFINEMENT
    state = machine.completeDiscovery(state);
    assert.assertEquals(state.phase, "DISCOVERY_REFINEMENT");
    assert.assertEquals(state.discovery.completed, true);

    // DISCOVERY_REFINEMENT → SPEC_PROPOSAL
    state = machine.approveDiscoveryReview(state);
    assert.assertEquals(state.phase, "SPEC_PROPOSAL");
    assert.assertEquals(state.specState.status, "draft");

    // SPEC_PROPOSAL → SPEC_APPROVED
    state = machine.approveSpec(state);
    assert.assertEquals(state.phase, "SPEC_APPROVED");
    assert.assertEquals(state.specState.status, "approved");

    // SPEC_APPROVED → EXECUTING
    state = machine.startExecution(state);
    assert.assertEquals(state.phase, "EXECUTING");
    assert.assertEquals(state.execution.iteration, 0);

    // Advance through 3 iterations
    state = machine.advanceExecution(state, "task 1 done");
    state = machine.advanceExecution(state, "task 2 done");
    state = machine.advanceExecution(state, "task 3 done");
    assert.assertEquals(state.execution.iteration, 3);

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
    assert.assertEquals(state.phase, "COMPLETED");
    assert.assertEquals(state.execution.iteration, 3);
    assert.assertEquals(state.decisions.length, 1);
    assert.assertEquals(state.spec, "photo-upload");
  });
});

// =============================================================================
// 1.2 All discovery answers preserved in state
// =============================================================================

bdd.describe("Discovery answers preserved", () => {
  bdd.it(
    "all 6 answers with specific text are retained after completeDiscovery",
    () => {
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
      assert.assertEquals(state.discovery.answers.length, 6);

      // Each has its specific text
      for (const q of qs) {
        const answer = state.discovery.answers.find(
          (a) => a.questionId === q.id,
        );
        assert.assertEquals(answer?.answer, `specific answer for ${q.id}`);
      }
    },
  );
});

// =============================================================================
// 1.3 Lifecycle with blocks and resolutions
// =============================================================================

bdd.describe("Lifecycle with BLOCKED state", () => {
  bdd.it("iteration counter continues after unblock", () => {
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
    assert.assertEquals(state.execution.iteration, 2);

    // Hit a block
    state = machine.blockExecution(state, "need API key decision");
    assert.assertEquals(state.phase, "BLOCKED");

    // Resolve block
    state = machine.transition(state, "EXECUTING");
    assert.assertEquals(state.phase, "EXECUTING");

    // Iteration preserved — doesn't reset
    assert.assertEquals(state.execution.iteration, 2);

    // Continue working
    state = machine.advanceExecution(state, "task 3");
    assert.assertEquals(state.execution.iteration, 3);

    // Complete
    state = machine.transition(state, "COMPLETED");
    assert.assertEquals(state.phase, "COMPLETED");
    assert.assertEquals(state.execution.iteration, 3);
  });
});

// =============================================================================
// 1.4 Reset mid-workflow clears everything
// =============================================================================

bdd.describe("Reset mid-workflow", () => {
  bdd.it("clears ALL state including debt and decisions", () => {
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

    assert.assertEquals(state.phase, "IDLE");
    assert.assertEquals(state.spec, null);
    assert.assertEquals(state.branch, null);
    assert.assertEquals(state.discovery.answers.length, 0);
    assert.assertEquals(state.discovery.completed, false);
    assert.assertEquals(state.execution.iteration, 0);
    assert.assertEquals(state.execution.lastProgress, null);
    assert.assertEquals(state.execution.modifiedFiles.length, 0);
    assert.assertEquals(state.execution.debt, null);
    assert.assertEquals(state.execution.awaitingStatusReport, false);
    assert.assertEquals(state.decisions.length, 0);
  });
});

// =============================================================================
// Section 2.3: Agent cannot force transitions
// =============================================================================

bdd.describe("Invalid transition shortcuts blocked", () => {
  bdd.it("cannot skip from DISCOVERY to EXECUTING", () => {
    const state = machine.startSpec(idle(), "x", "spec/x");
    assert.assertThrows(() => machine.startExecution(state), Error);
  });

  bdd.it("cannot approve from DISCOVERY", () => {
    const state = machine.startSpec(idle(), "x", "spec/x");
    assert.assertThrows(() => machine.approveSpec(state), Error);
  });

  bdd.it("cannot advanceExecution from DISCOVERY_REFINEMENT", () => {
    let state = machine.startSpec(idle(), "x", "spec/x");
    state = machine.completeDiscovery(state);
    assert.assertThrows(() => machine.advanceExecution(state, "x"), Error);
  });

  bdd.it("cannot start new spec while EXECUTING", () => {
    let state = machine.startSpec(idle(), "x", "spec/x");
    state = answerAllQuestions(state);
    state = machine.completeDiscovery(state);
    state = machine.approveDiscoveryReview(state);
    state = machine.approveSpec(state);
    state = machine.startExecution(state);
    assert.assertThrows(() => machine.startSpec(state, "y", "spec/y"), Error);
  });

  bdd.it("cannot block from DISCOVERY", () => {
    const state = machine.startSpec(idle(), "x", "spec/x");
    assert.assertThrows(() => machine.blockExecution(state, "reason"), Error);
  });
});
