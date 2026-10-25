// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Flow shortcut and edge case tests.
 *
 * Covers: skip classification, skip concerns, double approve, wrong-phase
 * transitions, reset mid-execution, empty discovery, malformed status reports,
 * and concern changes mid-execution.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";
import * as compiler from "../context/compiler.ts";
import * as template from "../spec/template.ts";
import * as questions from "../context/questions.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = defaultConcerns.DEFAULT_CONCERNS;
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
    s = machine.addDiscoveryAnswer(
      s,
      q.id,
      `detailed answer for question ${q.id}`,
    );
  }
  return s;
};

const inDiscoveryReview = (): schema.StateFile =>
  machine.completeDiscovery(withAllAnswers());

const inSpecDraft = (): schema.StateFile =>
  machine.approveDiscoveryReview(inDiscoveryReview());

const inSpecApproved = (): schema.StateFile =>
  machine.approveSpec(inSpecDraft());

const inExecuting = (): schema.StateFile =>
  machine.startExecution(inSpecApproved());

const inBlocked = (reason: string): schema.StateFile =>
  machine.blockExecution(inExecuting(), reason);

// =============================================================================
// Happy path: full flow with classification
// =============================================================================

bdd.describe("Happy path: full lifecycle with classification", () => {
  bdd.it(
    "init → spec → discovery → classification(all true) → approve → execute → done",
    () => {
      let s = idle();
      assert.assertEquals(s.phase, "IDLE");

      s = machine.startSpec(s, "my-feature", "spec/my-feature");
      assert.assertEquals(s.phase, "DISCOVERY");

      const qs = questions.getQuestionsWithExtras(activeConcerns);
      for (const q of qs) {
        s = machine.addDiscoveryAnswer(
          s,
          q.id,
          "answer with enough detail to pass Jidoka validation",
        );
      }
      s = machine.completeDiscovery(s);
      assert.assertEquals(s.phase, "DISCOVERY_REFINEMENT");

      s = machine.approveDiscoveryReview(s);
      assert.assertEquals(s.phase, "SPEC_PROPOSAL");
      // approveDiscoveryReview now auto-infers classification via
      // autoClassifyIfMissing (task-10), so it is never null at this point.
      assert.assertEquals(s.classification !== null, true);
      assert.assertEquals(s.classification?.source, "inferred");

      // Override with manual classification: all true
      s = {
        ...s,
        classification: {
          involvesWebUI: true,
          involvesCLI: false,
          involvesPublicAPI: true,
          involvesMigration: true,
          involvesDataHandling: true,
        },
      };

      s = machine.approveSpec(s);
      assert.assertEquals(s.phase, "SPEC_APPROVED");

      s = machine.startExecution(s);
      assert.assertEquals(s.phase, "EXECUTING");

      s = machine.advanceExecution(s, "all done");
      s = machine.completeSpec(s, "done");
      assert.assertEquals(s.phase, "COMPLETED");
    },
  );

  bdd.it("all-true classification renders all concern sections", () => {
    const allTrue = {
      involvesWebUI: true,
      involvesCLI: false,
      involvesPublicAPI: true,
      involvesMigration: true,
      involvesDataHandling: true,
    };
    const md = template.renderSpec("test", [], activeConcerns, [], allTrue);

    assert.assertEquals(md.includes("Design States"), true);
    assert.assertEquals(md.includes("Contributor Guide"), true);
  });

  bdd.it(
    "all-false classification hides conditional concern sections only",
    () => {
      const allFalse = {
        involvesWebUI: false,
        involvesCLI: false,
        involvesPublicAPI: false,
        involvesMigration: false,
        involvesDataHandling: false,
      };
      const md = template.renderSpec("test", [], activeConcerns, [], allFalse);

      // Conditional sections (involvesWebUI) hidden when flag is false
      assert.assertEquals(md.includes("Design States"), false);
      assert.assertEquals(md.includes("Mobile Layout"), false);
      // Unconditional sections (condition: null) always shown
      assert.assertEquals(md.includes("Contributor Guide"), true);
    },
  );
});

// =============================================================================
// Skip classification
// =============================================================================

bdd.describe("Skip classification: approve without classifying", () => {
  bdd.it(
    "approve from SPEC_PROPOSAL without manual classification succeeds",
    () => {
      // approveDiscoveryReview now auto-infers classification (task-10), so
      // inSpecDraft() produces a state with an inferred classification rather
      // than null. The shortcut under test is that the user never had to
      // manually classify — approveSpec still succeeds.
      const s = inSpecDraft();
      assert.assertEquals(s.classification !== null, true);
      assert.assertEquals(s.classification?.source, "inferred");

      const approved = machine.approveSpec(s);
      assert.assertEquals(approved.phase, "SPEC_APPROVED");
      assert.assertEquals(approved.classification !== null, true);
      assert.assertEquals(approved.classification?.source, "inferred");
    },
  );

  bdd.it(
    "null classification hides conditional sections but shows unconditional ones",
    () => {
      const md = template.renderSpec("test", [], activeConcerns, [], null);

      // Conditional sections (involvesWebUI) are hidden when classification is null
      assert.assertEquals(md.includes("Design States"), false);
      assert.assertEquals(md.includes("Mobile Layout"), false);
      // Unconditional sections (condition: null) are always visible
      assert.assertEquals(md.includes("Contributor Guide"), true);
      assert.assertEquals(md.includes("Public API Surface"), true);
    },
  );

  bdd.it(
    "null classification in backpressure produces no concern criteria",
    async () => {
      let s = inExecuting();
      // classification stays null from the skip
      s = {
        ...s,
        classification: null,
        execution: { ...s.execution, awaitingStatusReport: true },
      };

      const output = (await compiler.compile(
        s,
        activeConcerns,
        noRules,
        config(),
      )) as compiler.ExecutionOutput;

      const criteria = output.statusReport?.criteria ?? [];
      const concernCriteria = criteria.filter(
        (c) =>
          c.text.includes("open-source") ||
          c.text.includes("beautiful-product"),
      );
      assert.assertEquals(concernCriteria.length, 0);
    },
  );
});

// =============================================================================
// Skip concerns entirely
// =============================================================================

bdd.describe("Skip concerns: init with zero concerns", () => {
  bdd.it("zero concerns → only built-in extras in discovery", () => {
    const qs = questions.getQuestionsWithExtras([]);
    for (const q of qs) {
      if (q.id === "verification") {
        // Q5 always has 2 built-in extras (tests + docs) regardless of concerns
        assert.assertEquals(q.extras.length, 2);
      } else {
        assert.assertEquals(q.extras.length, 0);
      }
    }
  });

  bdd.it("zero concerns → spec has no concern sections", () => {
    const md = template.renderSpec("test", [], [], []);

    assert.assertEquals(md.includes("(open-source)"), false);
    assert.assertEquals(md.includes("(beautiful-product)"), false);
  });

  bdd.it("zero concerns → backpressure has no concern criteria", async () => {
    let s = inExecuting();
    s = {
      ...s,
      execution: { ...s.execution, awaitingStatusReport: true },
    };

    const output = (await compiler.compile(
      s,
      [],
      noRules,
    )) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const concernCriteria = criteria.filter(
      (c) =>
        c.text.includes("open-source") || c.text.includes("beautiful-product"),
    );
    assert.assertEquals(concernCriteria.length, 0);
  });
});

// =============================================================================
// Double approve
// =============================================================================

bdd.describe("Double approve: approve already-approved spec", () => {
  bdd.it("approve from SPEC_APPROVED throws (not a valid transition)", () => {
    const s = inSpecApproved();
    assert.assertEquals(s.phase, "SPEC_APPROVED");

    assert.assertThrows(() => machine.approveSpec(s));
  });
});

// =============================================================================
// Approve from wrong phase
// =============================================================================

bdd.describe("Approve from wrong phase", () => {
  bdd.it("approve from DISCOVERY throws", () => {
    const s = inDiscovery();
    assert.assertThrows(() => machine.approveSpec(s));
  });

  bdd.it("approve from EXECUTING throws", () => {
    const s = inExecuting();
    assert.assertThrows(() => machine.approveSpec(s));
  });

  bdd.it("approve from IDLE throws", () => {
    assert.assertThrows(() => machine.approveSpec(idle()));
  });

  bdd.it("approve from BLOCKED throws", () => {
    const s = inBlocked("need decision");
    assert.assertThrows(() => machine.approveSpec(s));
  });
});

// =============================================================================
// Reset mid-execution
// =============================================================================

bdd.describe("Reset mid-execution", () => {
  bdd.it("reset from EXECUTING clears all state back to IDLE", () => {
    let s = inExecuting();
    s = machine.advanceExecution(s, "task-1 done");
    s = machine.advanceExecution(s, "task-2 done");
    s = machine.advanceExecution(s, "task-3 done");
    assert.assertEquals(s.execution.iteration, 3);

    const reset = machine.resetToIdle(s);
    assert.assertEquals(reset.phase, "IDLE");
    assert.assertEquals(reset.spec, null);
    assert.assertEquals(reset.execution.iteration, 0);
    assert.assertEquals(reset.execution.completedTasks.length, 0);
    assert.assertEquals(reset.decisions.length, 0);
    assert.assertEquals(reset.classification, null);
  });
});

// =============================================================================
// Block from non-executing phase
// =============================================================================

bdd.describe("Block from non-executing phase", () => {
  bdd.it("block from DISCOVERY throws", () => {
    assert.assertThrows(() => machine.blockExecution(inDiscovery(), "reason"));
  });

  bdd.it("block from SPEC_PROPOSAL throws", () => {
    assert.assertThrows(() => machine.blockExecution(inSpecDraft(), "reason"));
  });

  bdd.it("block from IDLE throws", () => {
    assert.assertThrows(() => machine.blockExecution(idle(), "reason"));
  });
});

// =============================================================================
// Start execution without approve
// =============================================================================

bdd.describe("Start execution without approve", () => {
  bdd.it("startExecution from SPEC_PROPOSAL throws", () => {
    assert.assertThrows(() => machine.startExecution(inSpecDraft()));
  });

  bdd.it("startExecution from DISCOVERY throws", () => {
    assert.assertThrows(() => machine.startExecution(inDiscovery()));
  });
});

// =============================================================================
// Edge cases
// =============================================================================

bdd.describe("Edge case: empty discovery answers", () => {
  bdd.it(
    "addDiscoveryAnswer with empty string rejects with Jidoka validation",
    () => {
      const s = inDiscovery();
      assert.assertThrows(
        () => machine.addDiscoveryAnswer(s, "status_quo", ""),
        Error,
        "Answer too short",
      );
    },
  );
});

bdd.describe("Edge case: concern added mid-execution", () => {
  bdd.it(
    "adding concern mid-execution → next output includes new reminders",
    async () => {
      const s = inExecuting();

      // Initially compile with no concerns
      const output1 = (await compiler.compile(
        s,
        [],
        noRules,
      )) as compiler.ExecutionOutput;
      const reminders1 = output1.context.concernReminders;

      // Now compile with open-source concern added
      const output2 = (await compiler.compile(
        s,
        [openSource],
        noRules,
      )) as compiler.ExecutionOutput;
      const reminders2 = output2.context.concernReminders;

      assert.assertEquals(reminders1.length, 0);
      assert.assertEquals(reminders2.length > 0, true);
      assert.assertEquals(
        reminders2.some((r) => r.includes("open-source")),
        true,
      );
    },
  );
});

bdd.describe("Edge case: concern removed mid-execution", () => {
  bdd.it(
    "removing concern mid-execution → next output excludes its reminders",
    async () => {
      const s = inExecuting();

      // move-fast's reminders have no scope, so the EXECUTING instruction
      // carries them; beautiful-product's are all UI-scoped and reach the
      // agent through the PreToolUse hook instead.
      const moveFast = allConcerns.find((c) => c.id === "move-fast")!;

      // Compile with both concerns
      const output1 = (await compiler.compile(
        s,
        [openSource, moveFast],
        noRules,
      )) as compiler.ExecutionOutput;

      // Compile with only open-source (move-fast removed)
      const output2 = (await compiler.compile(
        s,
        [openSource],
        noRules,
      )) as compiler.ExecutionOutput;

      const hasMoveFast1 = output1.context.concernReminders.some((r) =>
        r.includes("move-fast"),
      );
      const hasMoveFast2 = output2.context.concernReminders.some((r) =>
        r.includes("move-fast"),
      );

      assert.assertEquals(hasMoveFast1, true);
      assert.assertEquals(hasMoveFast2, false);
    },
  );
});

bdd.describe(
  "Edge case: SPEC_PROPOSAL compiler output with null classification",
  () => {
    bdd.it(
      "shows classificationRequired: true when classification is null",
      async () => {
        // approveDiscoveryReview auto-infers classification (task-10), so we
        // force it back to null here to exercise the compiler's null-handling
        // branch. This test targets compileSpecDraft's null path, not the
        // state machine's classification timing.
        const s: schema.StateFile = { ...inSpecDraft(), classification: null };
        assert.assertEquals(s.classification, null);

        const output = (await compiler.compile(
          s,
          activeConcerns,
          noRules,
        )) as compiler.SpecDraftOutput;

        assert.assertEquals(output.phase, "SPEC_PROPOSAL");
        assert.assertEquals(output.classificationRequired, true);
      },
    );

    bdd.it(
      "shows no classificationRequired when classification is set",
      async () => {
        let s = inSpecDraft();
        s = {
          ...s,
          classification: {
            involvesWebUI: false,
            involvesCLI: false,
            involvesPublicAPI: false,
            involvesMigration: false,
            involvesDataHandling: false,
          },
        };

        const output = (await compiler.compile(
          s,
          activeConcerns,
          noRules,
        )) as compiler.SpecDraftOutput;

        assert.assertEquals(output.phase, "SPEC_PROPOSAL");
        assert.assertEquals(output.classificationRequired, undefined);
      },
    );
  },
);
