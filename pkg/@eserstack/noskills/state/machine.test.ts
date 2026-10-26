// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";
import * as questions from "../context/questions.ts";

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

bdd.describe("canTransition", () => {
  bdd.it("allows valid transitions", () => {
    assert.assertEquals(machine.canTransition("UNINITIALIZED", "IDLE"), true);
    assert.assertEquals(machine.canTransition("IDLE", "DISCOVERY"), true);
    assert.assertEquals(
      machine.canTransition("DISCOVERY", "DISCOVERY_REFINEMENT"),
      true,
    );
    assert.assertEquals(
      machine.canTransition("DISCOVERY_REFINEMENT", "SPEC_PROPOSAL"),
      true,
    );
    assert.assertEquals(
      machine.canTransition("SPEC_PROPOSAL", "SPEC_APPROVED"),
      true,
    );
    assert.assertEquals(
      machine.canTransition("SPEC_APPROVED", "EXECUTING"),
      true,
    );
    assert.assertEquals(machine.canTransition("EXECUTING", "COMPLETED"), true);
    assert.assertEquals(machine.canTransition("EXECUTING", "BLOCKED"), true);
    assert.assertEquals(machine.canTransition("BLOCKED", "EXECUTING"), true);
    assert.assertEquals(machine.canTransition("COMPLETED", "IDLE"), true);
    assert.assertEquals(machine.canTransition("COMPLETED", "DISCOVERY"), true);
  });

  bdd.it("rejects invalid transitions", () => {
    assert.assertEquals(machine.canTransition("DISCOVERY", "EXECUTING"), false);
    assert.assertEquals(
      machine.canTransition("DISCOVERY", "SPEC_PROPOSAL"),
      false,
    );
    assert.assertEquals(machine.canTransition("EXECUTING", "IDLE"), false);
    assert.assertEquals(
      machine.canTransition("SPEC_PROPOSAL", "EXECUTING"),
      false,
    );
    assert.assertEquals(machine.canTransition("SPEC_APPROVED", "IDLE"), false);
  });
});

// =============================================================================
// assertTransition
// =============================================================================

bdd.describe("assertTransition", () => {
  bdd.it("throws on invalid transition with descriptive message", () => {
    assert.assertThrows(
      () => machine.assertTransition("IDLE", "EXECUTING"),
      Error,
      "Invalid phase transition: IDLE → EXECUTING",
    );
  });

  bdd.it("does not throw on valid transition", () => {
    machine.assertTransition("IDLE", "DISCOVERY");
  });
});

// =============================================================================
// startSpec
// =============================================================================

bdd.describe("startSpec", () => {
  bdd.it("transitions IDLE → DISCOVERY with spec name and branch", () => {
    const state = machine.startSpec(idle(), "my-feature", "spec/my-feature");

    assert.assertEquals(state.phase, "DISCOVERY");
    assert.assertEquals(state.spec, "my-feature");
    assert.assertEquals(state.branch, "spec/my-feature");
  });

  bdd.it("resets discovery, execution, and decisions", () => {
    const state = machine.startSpec(idle(), "fresh", "spec/fresh");

    assert.assertEquals(state.discovery.answers.length, 0);
    assert.assertEquals(state.discovery.completed, false);
    assert.assertEquals(state.execution.iteration, 0);
    assert.assertEquals(state.execution.lastProgress, null);
    assert.assertEquals(state.decisions.length, 0);
  });

  bdd.it("throws from non-IDLE phases", () => {
    assert.assertThrows(
      () => machine.startSpec(inDiscovery(), "x", "spec/x"),
      Error,
    );
    assert.assertThrows(
      () => machine.startSpec(inExecuting(), "x", "spec/x"),
      Error,
    );
  });
});

// =============================================================================
// addDiscoveryAnswer
// =============================================================================

bdd.describe("addDiscoveryAnswer", () => {
  bdd.it("appends answer to discovery answers", () => {
    const state = machine.addDiscoveryAnswer(
      inDiscovery(),
      "status_quo",
      "users currently do X and need better tooling",
    );

    assert.assertEquals(state.discovery.answers.length, 1);
    assert.assertEquals(state.discovery.answers[0]?.questionId, "status_quo");
    assert.assertEquals(
      state.discovery.answers[0]?.answer,
      "users currently do X and need better tooling",
    );
  });

  bdd.it("dedupes by questionId on re-answer", () => {
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

    assert.assertEquals(state.discovery.answers.length, 1);
    assert.assertEquals(
      state.discovery.answers[0]?.answer,
      "updated answer with more detail",
    );
  });

  bdd.it("throws if not in DISCOVERY phase", () => {
    assert.assertThrows(
      () =>
        machine.addDiscoveryAnswer(idle(), "q1", "a meaningful answer here"),
      Error,
      "Cannot add discovery answer in phase: IDLE",
    );
  });

  bdd.it("rejects short answers (Jidoka: I1)", () => {
    assert.assertThrows(
      () => machine.addDiscoveryAnswer(inDiscovery(), "q1", "yes"),
      Error,
      "Answer too short",
    );
    assert.assertThrows(
      () => machine.addDiscoveryAnswer(inDiscovery(), "q1", "   short   "),
      Error,
      "Answer too short",
    );
  });
});

// =============================================================================
// completeDiscovery
// =============================================================================

bdd.describe("completeDiscovery", () => {
  bdd.it("transitions to DISCOVERY_REFINEMENT and sets completed", () => {
    const state = machine.completeDiscovery(inDiscovery());

    assert.assertEquals(state.phase, "DISCOVERY_REFINEMENT");
    assert.assertEquals(state.discovery.completed, true);
  });

  bdd.it("sets specState to draft with path", () => {
    const state = machine.completeDiscovery(inDiscovery());

    assert.assertEquals(state.specState.status, "draft");
    assert.assertEquals(state.specState.path, ".eser/specs/test-spec/spec.md");
  });

  bdd.it("throws if not in DISCOVERY", () => {
    assert.assertThrows(
      () => machine.completeDiscovery(idle()),
      Error,
      "Cannot complete discovery in phase: IDLE",
    );
  });
});

// =============================================================================
// approveDiscoveryReview
// =============================================================================

bdd.describe("approveDiscoveryReview", () => {
  bdd.it("transitions DISCOVERY_REFINEMENT to SPEC_PROPOSAL", () => {
    const state = machine.approveDiscoveryReview(inDiscoveryReview());

    assert.assertEquals(state.phase, "SPEC_PROPOSAL");
  });

  bdd.it("throws if not in DISCOVERY_REFINEMENT", () => {
    assert.assertThrows(() => machine.approveDiscoveryReview(idle()), Error);
  });
});

// =============================================================================
// advanceDiscoveryQuestion
// =============================================================================

bdd.describe("advanceDiscoveryQuestion", () => {
  bdd.it("increments currentQuestion", () => {
    const state = machine.advanceDiscoveryQuestion(inDiscovery());

    assert.assertEquals(state.discovery.currentQuestion, 1);
  });

  bdd.it("throws if not in DISCOVERY", () => {
    assert.assertThrows(
      () => machine.advanceDiscoveryQuestion(idle()),
      Error,
      "Cannot advance discovery question in phase: IDLE",
    );
  });
});

// =============================================================================
// approveSpec
// =============================================================================

bdd.describe("approveSpec", () => {
  bdd.it("transitions SPEC_PROPOSAL → SPEC_APPROVED", () => {
    const state = machine.approveSpec(inSpecDraft());

    assert.assertEquals(state.phase, "SPEC_APPROVED");
  });

  bdd.it("sets specState status to approved", () => {
    const state = machine.approveSpec(inSpecDraft());

    assert.assertEquals(state.specState.status, "approved");
  });

  bdd.it("throws from wrong phase", () => {
    assert.assertThrows(() => machine.approveSpec(idle()), Error);
    assert.assertThrows(() => machine.approveSpec(inDiscovery()), Error);
  });
});

// =============================================================================
// startExecution
// =============================================================================

bdd.describe("startExecution", () => {
  bdd.it("transitions SPEC_APPROVED → EXECUTING", () => {
    const state = machine.startExecution(inSpecApproved());

    assert.assertEquals(state.phase, "EXECUTING");
  });

  bdd.it("resets execution state", () => {
    const state = machine.startExecution(inSpecApproved());

    assert.assertEquals(state.execution.iteration, 0);
    assert.assertEquals(state.execution.lastProgress, null);
  });

  bdd.it("throws from wrong phase", () => {
    assert.assertThrows(() => machine.startExecution(idle()), Error);
    assert.assertThrows(() => machine.startExecution(inSpecDraft()), Error);
  });
});

// =============================================================================
// advanceExecution
// =============================================================================

bdd.describe("advanceExecution", () => {
  bdd.it("increments iteration counter", () => {
    const state = machine.advanceExecution(inExecuting(), "step 1 done");

    assert.assertEquals(state.execution.iteration, 1);
  });

  bdd.it("stores lastProgress message", () => {
    const state = machine.advanceExecution(inExecuting(), "implemented auth");

    assert.assertEquals(state.execution.lastProgress, "implemented auth");
  });

  bdd.it("increments cumulatively", () => {
    let state = machine.advanceExecution(inExecuting(), "step 1");
    state = machine.advanceExecution(state, "step 2");

    assert.assertEquals(state.execution.iteration, 2);
    assert.assertEquals(state.execution.lastProgress, "step 2");
  });

  bdd.it("throws if not in EXECUTING", () => {
    assert.assertThrows(
      () => machine.advanceExecution(idle(), "x"),
      Error,
      "Cannot advance execution in phase: IDLE",
    );
  });
});

// =============================================================================
// blockExecution
// =============================================================================

bdd.describe("blockExecution", () => {
  bdd.it("transitions EXECUTING → BLOCKED", () => {
    const state = machine.blockExecution(inExecuting(), "need API key");

    assert.assertEquals(state.phase, "BLOCKED");
  });

  bdd.it("stores reason in lastProgress with BLOCKED prefix", () => {
    const state = machine.blockExecution(inExecuting(), "need API key");

    assert.assertEquals(state.execution.lastProgress, "BLOCKED: need API key");
  });

  bdd.it("throws from non-EXECUTING phase", () => {
    assert.assertThrows(() => machine.blockExecution(idle(), "x"), Error);
  });
});

// =============================================================================
// addDecision
// =============================================================================

bdd.describe("addDecision", () => {
  bdd.it("appends decision to decisions array", () => {
    const decision: schema.Decision = {
      id: "d1",
      question: "Which DB?",
      choice: "PostgreSQL",
      promoted: false,
      timestamp: "2026-03-27T10:00:00Z",
    };
    const state = machine.addDecision(idle(), decision);

    assert.assertEquals(state.decisions.length, 1);
    assert.assertEquals(state.decisions[0]?.choice, "PostgreSQL");
  });

  bdd.it("works in any phase (decisions are cross-cutting)", () => {
    const decision: schema.Decision = {
      id: "d1",
      question: "q",
      choice: "c",
      promoted: false,
      timestamp: "2026-03-27T10:00:00Z",
    };

    assert.assertEquals(
      machine.addDecision(idle(), decision).decisions.length,
      1,
    );
    assert.assertEquals(
      machine.addDecision(inDiscovery(), decision).decisions.length,
      1,
    );
    assert.assertEquals(
      machine.addDecision(inExecuting(), decision).decisions.length,
      1,
    );
  });
});

// =============================================================================
// resetToIdle
// =============================================================================

bdd.describe("resetToIdle", () => {
  bdd.it("clears all fields and sets phase to IDLE", () => {
    const state = machine.resetToIdle(inExecuting());

    assert.assertEquals(state.phase, "IDLE");
    assert.assertEquals(state.spec, null);
    assert.assertEquals(state.branch, null);
    assert.assertEquals(state.discovery.answers.length, 0);
    assert.assertEquals(state.discovery.completed, false);
    assert.assertEquals(state.execution.iteration, 0);
    assert.assertEquals(state.decisions.length, 0);
  });

  bdd.it("preserves version field", () => {
    const original = inExecuting();
    const state = machine.resetToIdle(original);

    assert.assertEquals(state.version, original.version);
  });

  bdd.it(
    "allows reset from IDLE, EXECUTING, BLOCKED, COMPLETED (Jidoka I7)",
    () => {
      // IDLE → IDLE (noop but allowed)
      assert.assertEquals(machine.resetToIdle(idle()).phase, "IDLE");
      // EXECUTING → IDLE
      assert.assertEquals(machine.resetToIdle(inExecuting()).phase, "IDLE");
      // BLOCKED → IDLE
      assert.assertEquals(machine.resetToIdle(inBlocked()).phase, "IDLE");
      // COMPLETED → IDLE
      const completed = machine.completeSpec(inExecuting(), "done");
      assert.assertEquals(machine.resetToIdle(completed).phase, "IDLE");
    },
  );

  bdd.it(
    "rejects reset from DISCOVERY, DISCOVERY_REFINEMENT, SPEC_PROPOSAL, SPEC_APPROVED (Jidoka I7)",
    () => {
      assert.assertThrows(
        () => machine.resetToIdle(inDiscovery()),
        Error,
        "Cannot reset from DISCOVERY",
      );
      assert.assertThrows(
        () => machine.resetToIdle(inDiscoveryReview()),
        Error,
        "Cannot reset from DISCOVERY_REFINEMENT",
      );
      assert.assertThrows(
        () => machine.resetToIdle(inSpecDraft()),
        Error,
        "Cannot reset from SPEC_PROPOSAL",
      );
      assert.assertThrows(
        () => machine.resetToIdle(inSpecApproved()),
        Error,
        "Cannot reset from SPEC_APPROVED",
      );
    },
  );
});

// =============================================================================
// withAnswers helper
// =============================================================================

bdd.describe("withAnswers helper", () => {
  bdd.it("adds N answers to discovery state", () => {
    const state = withAnswers(inDiscovery(), 3);

    assert.assertEquals(state.discovery.answers.length, 3);
    assert.assertEquals(state.discovery.answers[0]?.questionId, "q0");
    assert.assertEquals(
      state.discovery.answers[2]?.answer,
      "answer-2 with enough detail to pass validation",
    );
  });
});

// =============================================================================
// BLOCKED round-trip
// =============================================================================

bdd.describe("BLOCKED round-trip", () => {
  bdd.it("block preserves iteration and resolving continues", () => {
    let state = inExecuting();
    state = machine.advanceExecution(state, "step 1");
    state = machine.advanceExecution(state, "step 2");

    const blocked = inBlocked();
    assert.assertEquals(blocked.phase, "BLOCKED");

    const unblocked = machine.transition(blocked, "EXECUTING");
    assert.assertEquals(unblocked.phase, "EXECUTING");
  });
});

// =============================================================================
// IDLE — default permissive state
// =============================================================================

bdd.describe("IDLE state", () => {
  bdd.it("createInitialState returns IDLE", () => {
    const state = schema.createInitialState();
    assert.assertEquals(state.phase, "IDLE");
  });

  bdd.it("IDLE → DISCOVERY via startSpec", () => {
    const state = machine.startSpec(idle(), "test", "spec/test");
    assert.assertEquals(state.phase, "DISCOVERY");
  });

  bdd.it("IDLE → COMPLETED via completeSpec", () => {
    const state = machine.completeSpec(idle(), "cancelled");
    assert.assertEquals(state.phase, "COMPLETED");
  });

  bdd.it("canTransition IDLE → DISCOVERY", () => {
    assert.assertEquals(machine.canTransition("IDLE", "DISCOVERY"), true);
  });

  bdd.it("canTransition IDLE → COMPLETED", () => {
    assert.assertEquals(machine.canTransition("IDLE", "COMPLETED"), true);
  });

  bdd.it("rejects IDLE → EXECUTING (must go through spec lifecycle)", () => {
    assert.assertEquals(machine.canTransition("IDLE", "EXECUTING"), false);
  });

  bdd.it("COMPLETED → IDLE (return to default after spec done)", () => {
    assert.assertEquals(machine.canTransition("COMPLETED", "IDLE"), true);
  });
});

// =============================================================================
// completeSpec (cancel/wontfix from every phase)
// =============================================================================

bdd.describe("completeSpec: cancel from every spec phase", () => {
  bdd.it("cancel from DISCOVERY → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inDiscovery(), "cancelled");
    assert.assertEquals(state.phase, "COMPLETED");
    assert.assertEquals(state.completionReason, "cancelled");
  });

  bdd.it("cancel from DISCOVERY_REFINEMENT → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inDiscoveryReview(), "cancelled");
    assert.assertEquals(state.phase, "COMPLETED");
    assert.assertEquals(state.completionReason, "cancelled");
  });

  bdd.it("cancel from SPEC_PROPOSAL → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inSpecDraft(), "cancelled");
    assert.assertEquals(state.phase, "COMPLETED");
    assert.assertEquals(state.completionReason, "cancelled");
  });

  bdd.it("cancel from SPEC_APPROVED → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inSpecApproved(), "cancelled");
    assert.assertEquals(state.phase, "COMPLETED");
    assert.assertEquals(state.completionReason, "cancelled");
  });

  bdd.it("cancel from EXECUTING → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inExecuting(), "cancelled");
    assert.assertEquals(state.phase, "COMPLETED");
    assert.assertEquals(state.completionReason, "cancelled");
  });

  bdd.it("cancel from BLOCKED → COMPLETED(cancelled)", () => {
    const state = machine.completeSpec(inBlocked(), "cancelled");
    assert.assertEquals(state.phase, "COMPLETED");
    assert.assertEquals(state.completionReason, "cancelled");
  });
});

bdd.describe("completeSpec: wontfix from spec phases", () => {
  bdd.it("wontfix from DISCOVERY → COMPLETED(wontfix) with note", () => {
    const state = machine.completeSpec(
      inDiscovery(),
      "wontfix",
      "resolved itself",
    );
    assert.assertEquals(state.phase, "COMPLETED");
    assert.assertEquals(state.completionReason, "wontfix");
    assert.assertEquals(state.completionNote, "resolved itself");
  });

  bdd.it("wontfix from EXECUTING → COMPLETED(wontfix) with note", () => {
    const state = machine.completeSpec(
      inExecuting(),
      "wontfix",
      "no longer relevant",
    );
    assert.assertEquals(state.phase, "COMPLETED");
    assert.assertEquals(state.completionReason, "wontfix");
    assert.assertEquals(state.completionNote, "no longer relevant");
  });
});

bdd.describe("completeSpec: COMPLETED rejects re-completion", () => {
  bdd.it("cancel from COMPLETED → throws (no self-transition)", () => {
    const completed = machine.completeSpec(inExecuting(), "done");
    assert.assertThrows(
      () => machine.completeSpec(completed, "cancelled"),
      Error,
      "Invalid phase transition: COMPLETED → COMPLETED",
    );
  });

  bdd.it("wontfix from COMPLETED → throws (no self-transition)", () => {
    const completed = machine.completeSpec(inExecuting(), "done");
    assert.assertThrows(
      () => machine.completeSpec(completed, "wontfix", "reason"),
      Error,
      "Invalid phase transition: COMPLETED → COMPLETED",
    );
  });
});

bdd.describe("completeSpec: command-level guards (IDLE)", () => {
  // IDLE → COMPLETED is a valid machine transition
  bdd.it("machine allows IDLE → COMPLETED", () => {
    const state = machine.completeSpec(idle(), "cancelled");
    assert.assertEquals(state.phase, "COMPLETED");
  });
});

// =============================================================================
// completeDiscoveryWhenReady
// =============================================================================

bdd.describe("completeDiscoveryWhenReady", () => {
  const withBaseAnswers = (): schema.StateFile => {
    let state = inDiscovery();
    for (const q of questions.QUESTIONS) {
      state = machine.addDiscoveryAnswer(
        state,
        q.id,
        `Answer for ${q.id} with enough detail`,
      );
    }
    return state;
  };

  bdd.it("waits while a base question is open", () => {
    const state = withAnswers(inDiscovery(), 3);

    assert.assertEquals(machine.completeDiscoveryWhenReady(state), state);
  });

  bdd.it("waits while a follow-up is pending", () => {
    const state = machine.addFollowUp(
      withBaseAnswers(),
      "ambition",
      "What does the 5-star version drop?",
      "agent",
    );

    assert.assertEquals(machine.completeDiscoveryWhenReady(state), state);
  });

  bdd.it("completes once the last follow-up is settled", () => {
    let state = machine.addFollowUp(
      withBaseAnswers(),
      "ambition",
      "What does the 5-star version drop?",
      "agent",
    );
    state = machine.skipFollowUp(state, "ambitiona");

    const completed = machine.completeDiscoveryWhenReady(state);
    assert.assertEquals(completed.phase, "DISCOVERY_REFINEMENT");
    assert.assertEquals(completed.discovery.completed, true);
  });

  bdd.it("completes the base answers with no follow-up", () => {
    assert.assertEquals(
      machine.completeDiscoveryWhenReady(withBaseAnswers()).phase,
      "DISCOVERY_REFINEMENT",
    );
  });

  bdd.it("leaves a state outside DISCOVERY alone", () => {
    const state = inExecuting();

    assert.assertEquals(machine.completeDiscoveryWhenReady(state), state);
  });
});

// =============================================================================
// Jidoka I2: follow-up blocking
// =============================================================================

bdd.describe("completeDiscovery follow-up blocking (Jidoka I2)", () => {
  bdd.it("blocks completion when pending follow-ups exist", () => {
    let state = inDiscovery();
    state = machine.addFollowUp(state, "q1", "What about edge cases?", "agent");

    assert.assertThrows(
      () => machine.completeDiscovery(state),
      Error,
      "pending follow-up",
    );
  });

  bdd.it("allows completion when follow-ups are answered", () => {
    let state = inDiscovery();
    state = machine.addFollowUp(state, "q1", "What about edge cases?", "agent");
    state = machine.answerFollowUp(
      state,
      "q1a",
      "Edge cases handled by validation layer",
    );

    const completed = machine.completeDiscovery(state);
    assert.assertEquals(completed.phase, "DISCOVERY_REFINEMENT");
  });

  bdd.it("allows completion when follow-ups are skipped", () => {
    let state = inDiscovery();
    state = machine.addFollowUp(state, "q1", "What about edge cases?", "agent");
    state = machine.skipFollowUp(state, "q1a");

    const completed = machine.completeDiscovery(state);
    assert.assertEquals(completed.phase, "DISCOVERY_REFINEMENT");
  });

  bdd.it("allows completion with no follow-ups", () => {
    const state = inDiscovery();
    const completed = machine.completeDiscovery(state);
    assert.assertEquals(completed.phase, "DISCOVERY_REFINEMENT");
  });
});

// =============================================================================
// Jidoka M2: confidence basis validation
// =============================================================================

bdd.describe("addConfidenceFinding basis validation (Jidoka M2)", () => {
  bdd.it("rejects high confidence without basis", () => {
    assert.assertThrows(
      () => machine.addConfidenceFinding(inExecuting(), "claim", 8, ""),
      Error,
      "High confidence",
    );
    assert.assertThrows(
      () => machine.addConfidenceFinding(inExecuting(), "claim", 9, "short"),
      Error,
      "High confidence",
    );
  });

  bdd.it("accepts high confidence with proper basis", () => {
    const state = machine.addConfidenceFinding(
      inExecuting(),
      "Upload handler lacks validation",
      9,
      "Read upload.ts:45 — no size check present",
    );
    assert.assertEquals((state.execution.confidenceFindings ?? []).length, 1);
  });

  bdd.it("accepts low confidence without basis", () => {
    const state = machine.addConfidenceFinding(
      inExecuting(),
      "Might be slow",
      3,
      "",
    );
    assert.assertEquals((state.execution.confidenceFindings ?? []).length, 1);
  });
});

// =============================================================================
// Jidoka Completeness Gate (approveDiscoveryReview)
// =============================================================================

bdd.describe("Jidoka Completeness Gate: approveDiscoveryReview", () => {
  const makeRefinementState = (
    placeholders: readonly schema.PlaceholderStatus[],
    pendingDecisions: readonly schema.PendingDecision[] = [],
  ): schema.StateFile => {
    const base = inDiscoveryReview();
    return {
      ...base,
      specState: {
        path: "spec/test-spec",
        status: "draft",
        metadata: {
          ...schema.EMPTY_SPEC_METADATA,
          pendingDecisions,
        },
        placeholders,
      },
    };
  };

  bdd.it("succeeds when all placeholders are filled", () => {
    const state = makeRefinementState([
      { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
      {
        sectionId: "problem-statement",
        sectionTitle: "Problem Statement",
        status: "filled",
      },
    ]);
    const advanced = machine.approveDiscoveryReview(state);
    assert.assertEquals(advanced.phase, "SPEC_PROPOSAL");
  });

  bdd.it("succeeds when all visible sections are N/A with reasons", () => {
    const state = makeRefinementState([
      {
        sectionId: "summary",
        sectionTitle: "Summary",
        status: "na",
        naReason: "this is a deletion PR — no new scope needed",
      },
    ]);
    const advanced = machine.approveDiscoveryReview(state);
    assert.assertEquals(advanced.phase, "SPEC_PROPOSAL");
  });

  bdd.it(
    "succeeds when placeholders are conditional-hidden (not required)",
    () => {
      const state = makeRefinementState([
        {
          sectionId: "design-states",
          sectionTitle: "Design States",
          status: "conditional-hidden",
        },
      ]);
      const advanced = machine.approveDiscoveryReview(state);
      assert.assertEquals(advanced.phase, "SPEC_PROPOSAL");
    },
  );

  bdd.it("throws when a placeholder remains unresolved", () => {
    const state = makeRefinementState([
      { sectionId: "summary", sectionTitle: "Summary", status: "placeholder" },
    ]);
    assert.assertThrows(
      () => machine.approveDiscoveryReview(state),
      Error,
      "Spec incomplete",
    );
  });

  // TASK-325: the refusal names the command that resolves a section.
  bdd.it("names the section command when a section is open", () => {
    const state = makeRefinementState([
      { sectionId: "summary", sectionTitle: "Summary", status: "placeholder" },
    ]);
    const error = assert.assertThrows(
      () => machine.approveDiscoveryReview(state),
      Error,
    );
    assert.assertStringIncludes(error.message, "  - Summary (summary)");
    assert.assertStringIncludes(error.message, 'section <id> fill "text"');
    assert.assertStringIncludes(error.message, 'section <id> na "reason"');
    assert.assertStringIncludes(error.message, "section list");
  });

  bdd.it("throws when N/A has no reason", () => {
    const state = makeRefinementState([
      { sectionId: "summary", sectionTitle: "Summary", status: "na" },
    ]);
    assert.assertThrows(
      () => machine.approveDiscoveryReview(state),
      Error,
      "Spec incomplete",
    );
  });

  bdd.it("throws when a pending decision exists", () => {
    const state = makeRefinementState(
      [{ sectionId: "summary", sectionTitle: "Summary", status: "filled" }],
      [
        {
          section: "auth",
          question: "Which provider?",
          waitingFor: ["@alice"],
        },
      ],
    );
    assert.assertThrows(
      () => machine.approveDiscoveryReview(state),
      Error,
      "Spec incomplete",
    );
  });

  bdd.it("error message lists every unresolved section title", () => {
    const state = makeRefinementState([
      {
        sectionId: "s1",
        sectionTitle: "Problem Statement",
        status: "placeholder",
      },
      { sectionId: "s2", sectionTitle: "Ambition", status: "placeholder" },
    ]);
    let thrown = false;
    try {
      machine.approveDiscoveryReview(state);
    } catch (e) {
      thrown = true;
      const msg = (e as Error).message;
      assert.assertEquals(msg.includes("Problem Statement"), true);
      assert.assertEquals(msg.includes("Ambition"), true);
    }
    assert.assertEquals(thrown, true);
  });
});

// =============================================================================
// RefinementSubState: getDiscoveryRefinementStage
// =============================================================================

const sampleScore: schema.CompletenessScore = {
  overall: 7,
  dimensions: [{ id: "problem-clarity", score: 7, notes: "clear" }],
  gaps: ["missing verification"],
  assessedAt: "2026-04-07T00:00:00.000Z",
};

const sampleReadiness: schema.CeoReviewReadiness = {
  overall: 8,
  dimensions: [{ id: "premise-clarity", score: 8, notes: "solid" }],
  verdict: "approved",
};

bdd.describe("getDiscoveryRefinementStage", () => {
  bdd.it("returns 'stage-a' when no refinement sub-state", () => {
    assert.assertEquals(
      machine.getDiscoveryRefinementStage(inDiscoveryReview()),
      "stage-a",
    );
  });

  bdd.it("returns 'stage-a' when refinement present but no posture", () => {
    const state = machine.setCompletenessScore(
      inDiscoveryReview(),
      sampleScore,
    );
    assert.assertEquals(machine.getDiscoveryRefinementStage(state), "stage-a");
  });

  bdd.it("returns 'stage-b' when posture is set but no ceoReview", () => {
    const state = machine.setReviewPosture(inDiscoveryReview(), "hold-scope");
    assert.assertEquals(machine.getDiscoveryRefinementStage(state), "stage-b");
  });

  bdd.it("returns 'stage-c' when ceoReview is present", () => {
    const base = machine.setReviewPosture(
      inDiscoveryReview(),
      "selective-expansion",
    );
    const state = machine.setCeoReviewReadiness(base, sampleReadiness);
    assert.assertEquals(machine.getDiscoveryRefinementStage(state), "stage-c");
  });
});

// =============================================================================
// RefinementSubState: setCompletenessScore
// =============================================================================

bdd.describe("setCompletenessScore", () => {
  bdd.it(
    "first call sets both initialCompletenessScore and completenessScore",
    () => {
      const state = machine.setCompletenessScore(
        inDiscoveryReview(),
        sampleScore,
      );
      assert.assertEquals(
        state.discovery.refinement?.initialCompletenessScore,
        sampleScore,
      );
      assert.assertEquals(
        state.discovery.refinement?.completenessScore,
        sampleScore,
      );
    },
  );

  bdd.it(
    "second call updates completenessScore but preserves initialCompletenessScore",
    () => {
      const updated: schema.CompletenessScore = { ...sampleScore, overall: 9 };
      const first = machine.setCompletenessScore(
        inDiscoveryReview(),
        sampleScore,
      );
      const second = machine.setCompletenessScore(first, updated);
      assert.assertEquals(
        second.discovery.refinement?.initialCompletenessScore,
        sampleScore,
      );
      assert.assertEquals(
        second.discovery.refinement?.completenessScore,
        updated,
      );
    },
  );

  bdd.it(
    "merges with existing refinement sub-state (preserves reviewPosture)",
    () => {
      const withPosture = machine.setReviewPosture(
        inDiscoveryReview(),
        "hold-scope",
      );
      const withScore = machine.setCompletenessScore(withPosture, sampleScore);
      assert.assertEquals(
        withScore.discovery.refinement?.reviewPosture,
        "hold-scope",
      );
      assert.assertEquals(
        withScore.discovery.refinement?.completenessScore,
        sampleScore,
      );
    },
  );

  bdd.it("throws when called outside DISCOVERY_REFINEMENT", () => {
    assert.assertThrows(
      () => machine.setCompletenessScore(inDiscovery(), sampleScore),
      Error,
      "invalid phase",
    );
  });
});

// =============================================================================
// RefinementSubState: setReviewPosture
// =============================================================================

bdd.describe("setReviewPosture", () => {
  bdd.it("stores posture in refinement sub-state", () => {
    const state = machine.setReviewPosture(
      inDiscoveryReview(),
      "selective-expansion",
    );
    assert.assertEquals(
      state.discovery.refinement?.reviewPosture,
      "selective-expansion",
    );
  });

  bdd.it("merges with existing completenessScore", () => {
    const withScore = machine.setCompletenessScore(
      inDiscoveryReview(),
      sampleScore,
    );
    const withPosture = machine.setReviewPosture(withScore, "scope-reduction");
    assert.assertEquals(
      withPosture.discovery.refinement?.completenessScore,
      sampleScore,
    );
    assert.assertEquals(
      withPosture.discovery.refinement?.reviewPosture,
      "scope-reduction",
    );
  });

  bdd.it("throws when called outside DISCOVERY_REFINEMENT", () => {
    assert.assertThrows(
      () => machine.setReviewPosture(inDiscovery(), "hold-scope"),
      Error,
      "invalid phase",
    );
  });
});

// =============================================================================
// RefinementSubState: setCeoReviewReadiness
// =============================================================================

bdd.describe("setCeoReviewReadiness", () => {
  bdd.it("stores readiness and optional reflection", () => {
    const base = machine.setReviewPosture(
      inDiscoveryReview(),
      "selective-expansion",
    );
    const state = machine.setCeoReviewReadiness(
      base,
      sampleReadiness,
      "solid choices throughout",
    );
    assert.assertEquals(
      state.discovery.refinement?.ceoReview?.readinessScore,
      sampleReadiness,
    );
    assert.assertEquals(
      state.discovery.refinement?.ceoReview?.reflection,
      "solid choices throughout",
    );
  });

  bdd.it("throws when called outside DISCOVERY_REFINEMENT", () => {
    assert.assertThrows(
      () => machine.setCeoReviewReadiness(inDiscovery(), sampleReadiness),
      Error,
      "invalid phase",
    );
  });
});

// =============================================================================
// RefinementSubState: clearRefinement
// =============================================================================

bdd.describe("clearRefinement", () => {
  bdd.it("resets refinement to undefined in DISCOVERY_REFINEMENT", () => {
    const withPosture = machine.setReviewPosture(
      inDiscoveryReview(),
      "hold-scope",
    );
    const cleared = machine.clearRefinement(withPosture);
    assert.assertEquals(cleared.discovery.refinement, undefined);
    assert.assertEquals(cleared.phase, "DISCOVERY_REFINEMENT");
  });

  bdd.it("throws when called outside DISCOVERY_REFINEMENT", () => {
    assert.assertThrows(
      () => machine.clearRefinement(inDiscovery()),
      Error,
      "invalid phase",
    );
  });
});

// =============================================================================
// revisitSpec / reopenSpec: clears refinement sub-state
// =============================================================================

bdd.describe("revisitSpec clears refinement", () => {
  bdd.it(
    "discovery.refinement is undefined after revisit from EXECUTING",
    () => {
      const withPosture = machine.setReviewPosture(
        inDiscoveryReview(),
        "selective-expansion",
      );
      const specDraft = machine.approveDiscoveryReview(withPosture);
      const specApproved = machine.approveSpec(specDraft);
      const executing = machine.startExecution(specApproved);
      const revisited = machine.revisitSpec(executing, "need clarification");
      assert.assertEquals(revisited.discovery.refinement, undefined);
      assert.assertEquals(revisited.phase, "DISCOVERY");
    },
  );
});

bdd.describe("reopenSpec clears refinement", () => {
  bdd.it(
    "discovery.refinement is undefined after reopening from COMPLETED",
    () => {
      const withPosture = machine.setReviewPosture(
        inDiscoveryReview(),
        "selective-expansion",
      );
      const specDraft = machine.approveDiscoveryReview(withPosture);
      const specApproved = machine.approveSpec(specDraft);
      const executing = machine.startExecution(specApproved);
      const completed = machine.completeSpec(executing, "done");
      const reopened = machine.reopenSpec(completed);
      assert.assertEquals(reopened.discovery.refinement, undefined);
      assert.assertEquals(reopened.phase, "DISCOVERY");
    },
  );
});
