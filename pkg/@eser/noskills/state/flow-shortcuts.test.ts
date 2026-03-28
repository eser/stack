// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Flow shortcut and edge case tests.
 *
 * Covers: skip classification, skip concerns, double approve, wrong-phase
 * transitions, reset mid-execution, empty discovery, malformed status reports,
 * and concern changes mid-execution.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";
import * as compiler from "../context/compiler.ts";
import * as template from "../spec/template.ts";
import * as questions from "../context/questions.ts";
import { loadDefaultConcerns } from "../context/concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await loadDefaultConcerns();
const openSource = allConcerns.find((c) => c.id === "open-source")!;
const beautiful = allConcerns.find((c) => c.id === "beautiful-product")!;
const activeConcerns = [openSource, beautiful];
const noRules: readonly string[] = [];

const config = (): schema.NosManifest =>
  schema.createInitialManifest(
    ["open-source", "beautiful-product"],
    ["claude-code"],
    ["anthropic"],
    {
      languages: ["typescript"],
      frameworks: [],
      ci: [],
      testRunner: "deno",
    },
  );

const idle = (): schema.StateFile => schema.createInitialState();

const inDiscovery = (): schema.StateFile =>
  machine.startSpec(idle(), "test-spec", "spec/test-spec");

const withAllAnswers = (): schema.StateFile => {
  let s = inDiscovery();
  const qs = questions.getQuestionsWithExtras(activeConcerns);
  for (const q of qs) {
    s = machine.addDiscoveryAnswer(s, q.id, `answer for ${q.id}`);
  }
  return s;
};

const inSpecDraft = (): schema.StateFile =>
  machine.completeDiscovery(withAllAnswers());

const inSpecApproved = (): schema.StateFile =>
  machine.approveSpec(inSpecDraft());

const inExecuting = (): schema.StateFile =>
  machine.startExecution(inSpecApproved());

const inBlocked = (reason: string): schema.StateFile =>
  machine.blockExecution(inExecuting(), reason);

// =============================================================================
// Happy path: full flow with classification
// =============================================================================

describe("Happy path: full lifecycle with classification", () => {
  it("init → spec → discovery → classification(all true) → approve → execute → done", () => {
    let s = idle();
    assertEquals(s.phase, "IDLE");

    s = machine.startSpec(s, "my-feature", "spec/my-feature");
    assertEquals(s.phase, "DISCOVERY");

    const qs = questions.getQuestionsWithExtras(activeConcerns);
    for (const q of qs) {
      s = machine.addDiscoveryAnswer(s, q.id, "answer");
    }
    s = machine.completeDiscovery(s);
    assertEquals(s.phase, "SPEC_DRAFT");
    assertEquals(s.classification, null);

    // Provide classification: all true
    s = {
      ...s,
      classification: {
        involvesUI: true,
        involvesPublicAPI: true,
        involvesMigration: true,
        involvesDataHandling: true,
      },
    };

    s = machine.approveSpec(s);
    assertEquals(s.phase, "SPEC_APPROVED");

    s = machine.startExecution(s);
    assertEquals(s.phase, "EXECUTING");

    s = machine.advanceExecution(s, "all done");
    s = machine.transition(s, "DONE");
    assertEquals(s.phase, "DONE");
  });

  it("all-true classification renders all concern sections", () => {
    const allTrue = {
      involvesUI: true,
      involvesPublicAPI: true,
      involvesMigration: true,
      involvesDataHandling: true,
    };
    const md = template.renderSpec("test", [], activeConcerns, [], allTrue);

    assertEquals(md.includes("Design States"), true);
    assertEquals(md.includes("Contributor Guide"), true);
  });

  it("all-false classification renders zero concern sections", () => {
    const allFalse = {
      involvesUI: false,
      involvesPublicAPI: false,
      involvesMigration: false,
      involvesDataHandling: false,
    };
    const md = template.renderSpec("test", [], activeConcerns, [], allFalse);

    assertEquals(md.includes("Design States"), false);
    assertEquals(md.includes("Mobile Layout"), false);
    assertEquals(md.includes("Contributor Guide"), false);
  });
});

// =============================================================================
// Skip classification
// =============================================================================

describe("Skip classification: approve without classifying", () => {
  it("approve from SPEC_DRAFT with null classification succeeds", () => {
    const s = inSpecDraft();
    assertEquals(s.classification, null);

    const approved = machine.approveSpec(s);
    assertEquals(approved.phase, "SPEC_APPROVED");
    assertEquals(approved.classification, null);
  });

  it("null classification produces spec with zero concern sections", () => {
    const md = template.renderSpec("test", [], activeConcerns, [], null);

    assertEquals(md.includes("Design States"), false);
    assertEquals(md.includes("Mobile Layout"), false);
    assertEquals(md.includes("Contributor Guide"), false);
    assertEquals(md.includes("Public API Surface"), false);
  });

  it("null classification in backpressure produces no concern criteria", () => {
    let s = inExecuting();
    // classification stays null from the skip
    s = {
      ...s,
      classification: null,
      execution: { ...s.execution, awaitingStatusReport: true },
    };

    const output = compiler.compile(
      s,
      activeConcerns,
      noRules,
      config(),
    ) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const concernCriteria = criteria.filter(
      (c) => c.includes("open-source") || c.includes("beautiful-product"),
    );
    assertEquals(concernCriteria.length, 0);
  });
});

// =============================================================================
// Skip concerns entirely
// =============================================================================

describe("Skip concerns: init with zero concerns", () => {
  it("zero concerns → no concern extras in discovery", () => {
    const qs = questions.getQuestionsWithExtras([]);
    for (const q of qs) {
      assertEquals(q.extras.length, 0);
    }
  });

  it("zero concerns → spec has no concern sections", () => {
    const md = template.renderSpec("test", [], [], []);

    assertEquals(md.includes("(open-source)"), false);
    assertEquals(md.includes("(beautiful-product)"), false);
  });

  it("zero concerns → backpressure has no concern criteria", () => {
    let s = inExecuting();
    s = {
      ...s,
      execution: { ...s.execution, awaitingStatusReport: true },
    };

    const output = compiler.compile(
      s,
      [],
      noRules,
    ) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const concernCriteria = criteria.filter(
      (c) => c.includes("open-source") || c.includes("beautiful-product"),
    );
    assertEquals(concernCriteria.length, 0);
  });
});

// =============================================================================
// Double approve
// =============================================================================

describe("Double approve: approve already-approved spec", () => {
  it("approve from SPEC_APPROVED throws (not a valid transition)", () => {
    const s = inSpecApproved();
    assertEquals(s.phase, "SPEC_APPROVED");

    assertThrows(() => machine.approveSpec(s));
  });
});

// =============================================================================
// Approve from wrong phase
// =============================================================================

describe("Approve from wrong phase", () => {
  it("approve from DISCOVERY throws", () => {
    const s = inDiscovery();
    assertThrows(() => machine.approveSpec(s));
  });

  it("approve from EXECUTING throws", () => {
    const s = inExecuting();
    assertThrows(() => machine.approveSpec(s));
  });

  it("approve from IDLE throws", () => {
    assertThrows(() => machine.approveSpec(idle()));
  });

  it("approve from BLOCKED throws", () => {
    const s = inBlocked("need decision");
    assertThrows(() => machine.approveSpec(s));
  });
});

// =============================================================================
// Reset mid-execution
// =============================================================================

describe("Reset mid-execution", () => {
  it("reset from EXECUTING clears all state back to IDLE", () => {
    let s = inExecuting();
    s = machine.advanceExecution(s, "task-1 done");
    s = machine.advanceExecution(s, "task-2 done");
    s = machine.advanceExecution(s, "task-3 done");
    assertEquals(s.execution.iteration, 3);

    const reset = machine.resetToIdle(s);
    assertEquals(reset.phase, "IDLE");
    assertEquals(reset.spec, null);
    assertEquals(reset.execution.iteration, 0);
    assertEquals(reset.execution.completedTasks.length, 0);
    assertEquals(reset.decisions.length, 0);
    assertEquals(reset.classification, null);
  });
});

// =============================================================================
// Block from non-executing phase
// =============================================================================

describe("Block from non-executing phase", () => {
  it("block from DISCOVERY throws", () => {
    assertThrows(() => machine.blockExecution(inDiscovery(), "reason"));
  });

  it("block from SPEC_DRAFT throws", () => {
    assertThrows(() => machine.blockExecution(inSpecDraft(), "reason"));
  });

  it("block from IDLE throws", () => {
    assertThrows(() => machine.blockExecution(idle(), "reason"));
  });
});

// =============================================================================
// Start execution without approve
// =============================================================================

describe("Start execution without approve", () => {
  it("startExecution from SPEC_DRAFT throws", () => {
    assertThrows(() => machine.startExecution(inSpecDraft()));
  });

  it("startExecution from DISCOVERY throws", () => {
    assertThrows(() => machine.startExecution(inDiscovery()));
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe("Edge case: empty discovery answers", () => {
  it("addDiscoveryAnswer with empty string stores it without crash", () => {
    let s = inDiscovery();
    s = machine.addDiscoveryAnswer(s, "status_quo", "");
    assertEquals(s.discovery.answers.length, 1);
    assertEquals(s.discovery.answers[0]!.answer, "");
  });
});

describe("Edge case: concern added mid-execution", () => {
  it("adding concern mid-execution → next output includes new reminders", () => {
    const s = inExecuting();

    // Initially compile with no concerns
    const output1 = compiler.compile(
      s,
      [],
      noRules,
    ) as compiler.ExecutionOutput;
    const reminders1 = output1.context.concernReminders;

    // Now compile with open-source concern added
    const output2 = compiler.compile(
      s,
      [openSource],
      noRules,
    ) as compiler.ExecutionOutput;
    const reminders2 = output2.context.concernReminders;

    assertEquals(reminders1.length, 0);
    assertEquals(reminders2.length > 0, true);
    assertEquals(
      reminders2.some((r) => r.includes("open-source")),
      true,
    );
  });
});

describe("Edge case: concern removed mid-execution", () => {
  it("removing concern mid-execution → next output excludes its reminders", () => {
    const s = inExecuting();

    // Compile with both concerns
    const output1 = compiler.compile(
      s,
      activeConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    // Compile with only open-source (beautiful-product removed)
    const output2 = compiler.compile(
      s,
      [openSource],
      noRules,
    ) as compiler.ExecutionOutput;

    const hasBeautiful1 = output1.context.concernReminders.some((r) =>
      r.includes("beautiful-product")
    );
    const hasBeautiful2 = output2.context.concernReminders.some((r) =>
      r.includes("beautiful-product")
    );

    assertEquals(hasBeautiful1, true);
    assertEquals(hasBeautiful2, false);
  });
});

describe("Edge case: SPEC_DRAFT compiler output with null classification", () => {
  it("shows classificationRequired: true when classification is null", () => {
    const s = inSpecDraft();
    assertEquals(s.classification, null);

    const output = compiler.compile(
      s,
      activeConcerns,
      noRules,
    ) as compiler.SpecDraftOutput;

    assertEquals(output.phase, "SPEC_DRAFT");
    assertEquals(output.classificationRequired, true);
  });

  it("shows no classificationRequired when classification is set", () => {
    let s = inSpecDraft();
    s = {
      ...s,
      classification: {
        involvesUI: false,
        involvesPublicAPI: false,
        involvesMigration: false,
        involvesDataHandling: false,
      },
    };

    const output = compiler.compile(
      s,
      activeConcerns,
      noRules,
    ) as compiler.SpecDraftOutput;

    assertEquals(output.phase, "SPEC_DRAFT");
    assertEquals(output.classificationRequired, undefined);
  });
});
