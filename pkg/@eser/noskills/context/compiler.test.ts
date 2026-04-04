// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as compiler from "./compiler.ts";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as questions from "./questions.ts";
import { loadDefaultConcerns } from "./concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await loadDefaultConcerns();
const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];
const someRules = ["Use Deno", "No global state"];

const moveFast = allConcerns.find((c) => c.id === "move-fast")!;
const compliance = allConcerns.find((c) => c.id === "compliance")!;
const openSource = allConcerns.find((c) => c.id === "open-source")!;

const idle = (): schema.StateFile => schema.createInitialState();

const inDiscovery = (): schema.StateFile =>
  machine.startSpec(idle(), "test-spec", "spec/test-spec");

const inDiscoveryReview = (): schema.StateFile =>
  machine.completeDiscovery(inDiscovery());

const inSpecDraft = (): schema.StateFile =>
  machine.approveDiscoveryReview(inDiscoveryReview());

const inSpecApproved = (): schema.StateFile =>
  machine.approveSpec(inSpecDraft());

const inExecuting = (): schema.StateFile =>
  machine.startExecution(inSpecApproved());

const inBlocked = (): schema.StateFile =>
  machine.blockExecution(inExecuting(), "need API key");

const inCompleted = (): schema.StateFile =>
  machine.completeSpec(inExecuting(), "done");

// =============================================================================
// compile
// =============================================================================

describe("compile", () => {
  it("IDLE returns IdleOutput with instruction", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);

    assertEquals(output.phase, "IDLE");
    assertEquals("instruction" in output, true);
  });

  it("DISCOVERY with unanswered returns DiscoveryOutput with next question", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);

    assertEquals(output.phase, "DISCOVERY");
    const discovery = output as compiler.DiscoveryOutput;
    assertEquals(discovery.questions.length, 6);
    assertEquals(discovery.questions[0]?.id, "status_quo");
  });

  it("DISCOVERY includes rules and concern reminders in context", async () => {
    const output = await compiler.compile(
      inDiscovery(),
      [openSource],
      someRules,
    ) as compiler.DiscoveryOutput;

    assertEquals(output.context.rules.length, 2);
    assertEquals(output.context.concernReminders.length > 0, true);
  });

  it("DISCOVERY includes concern extras in question", async () => {
    const output = await compiler.compile(
      inDiscovery(),
      [openSource],
      noRules,
    ) as compiler.DiscoveryOutput;

    // open-source adds an extra to status_quo question
    assertEquals((output.questions[0]?.extras.length ?? 0) > 0, true);
  });

  it("SPEC_DRAFT without classification shows classification prompt", async () => {
    const output = await compiler.compile(inSpecDraft(), noConcerns, noRules);

    assertEquals(output.phase, "SPEC_DRAFT");
    const specDraft = output as compiler.SpecDraftOutput;
    assertEquals(specDraft.classificationRequired, true);
    assertEquals(specDraft.classificationPrompt !== undefined, true);
  });

  it("SPEC_DRAFT with classification shows approve transition", async () => {
    const state = {
      ...inSpecDraft(),
      classification: {
        involvesWebUI: false,
        involvesCLI: false,
        involvesPublicAPI: false,
        involvesMigration: false,
        involvesDataHandling: false,
      },
    };
    const output = await compiler.compile(state, noConcerns, noRules);

    assertEquals(output.phase, "SPEC_DRAFT");
    const specDraft = output as compiler.SpecDraftOutput;
    assertEquals(specDraft.classificationRequired, undefined);
    assertEquals(specDraft.transition.onApprove.includes("approve"), true);
  });

  it("SPEC_APPROVED returns SpecApprovedOutput with onStart transition", async () => {
    const output = await compiler.compile(
      inSpecApproved(),
      noConcerns,
      noRules,
    );

    assertEquals(output.phase, "SPEC_APPROVED");
    const approved = output as compiler.SpecApprovedOutput;
    assertEquals(approved.specPath, ".eser/specs/test-spec/spec.md");
    assertEquals(approved.transition.onStart.includes("noskills spec"), true);
  });

  it("EXECUTING returns ExecutionOutput with iteration", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);

    assertEquals(output.phase, "EXECUTING");
    const exec = output as compiler.ExecutionOutput;
    assertEquals(exec.transition.iteration, 0);
  });

  it("EXECUTING with tensions includes concernTensions array", async () => {
    const output = await compiler.compile(
      inExecuting(),
      [moveFast, compliance],
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.concernTensions !== undefined, true);
    assertEquals(output.concernTensions!.length, 1);
  });

  it("BLOCKED returns BlockedOutput with reason", async () => {
    const output = await compiler.compile(inBlocked(), noConcerns, noRules);

    assertEquals(output.phase, "BLOCKED");
    const blocked = output as compiler.BlockedOutput;
    assertEquals(blocked.reason, "BLOCKED: need API key");
  });

  it("COMPLETED returns CompletedOutput with summary", async () => {
    const output = await compiler.compile(inCompleted(), noConcerns, noRules);

    assertEquals(output.phase, "COMPLETED");
    const completed = output as compiler.CompletedOutput;
    assertEquals(completed.summary.spec, "test-spec");
    assertEquals(completed.summary.iterations, 0);
    assertEquals(completed.summary.decisionsCount, 0);
  });

  it("UNINITIALIZED falls through to IdleOutput", async () => {
    const state = { ...idle(), phase: "UNINITIALIZED" as schema.Phase };
    const output = await compiler.compile(state, noConcerns, noRules);

    assertEquals(output.phase, "IDLE");
  });

  it("every output includes meta block with resumeHint", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);

    assertEquals(output.meta !== undefined, true);
    assertEquals(output.meta.spec, "test-spec");
    assertEquals(typeof output.meta.resumeHint, "string");
    assertEquals(output.meta.resumeHint.length > 0, true);
  });

  it("includes protocolGuide on first call (lastCalledAt null)", async () => {
    // Default state has lastCalledAt: null
    const output = await compiler.compile(idle(), noConcerns, noRules);

    assertEquals(output.protocolGuide !== undefined, true);
    assertEquals(output.protocolGuide!.currentPhase, "IDLE");
  });

  it("omits protocolGuide when lastCalledAt is recent", async () => {
    const recentState = {
      ...idle(),
      lastCalledAt: new Date().toISOString(),
    };
    const output = await compiler.compile(recentState, noConcerns, noRules);

    assertEquals(output.protocolGuide, undefined);
  });

  it("includes protocolGuide when lastCalledAt is stale (>5 min)", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const staleState = { ...idle(), lastCalledAt: staleTime };
    const output = await compiler.compile(staleState, noConcerns, noRules);

    assertEquals(output.protocolGuide !== undefined, true);
  });

  it("EXECUTING includes restartRecommended when over threshold", async () => {
    // Create a state with high iteration count
    let state = inExecuting();
    for (let i = 0; i < 16; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }

    const config = schema.createInitialManifest([], [], [], {
      languages: [],
      frameworks: [],
      ci: [],
      testRunner: null,
    });
    const output = await compiler.compile(
      state,
      noConcerns,
      noRules,
      config,
    ) as compiler.ExecutionOutput & { meta: compiler.MetaBlock };

    assertEquals(output.restartRecommended, true);
    assertEquals(typeof output.restartInstruction, "string");
  });

  it("EXECUTING omits restartRecommended when under threshold", async () => {
    const output = await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput & { meta: compiler.MetaBlock };

    assertEquals(output.restartRecommended, undefined);
  });

  it("every output includes behavioral block with rules and tone", async () => {
    const phases = [
      idle(),
      inDiscovery(),
      inSpecDraft(),
      inSpecApproved(),
      inExecuting(),
      inBlocked(),
      inCompleted(),
    ];

    for (const state of phases) {
      const output = await compiler.compile(state, noConcerns, noRules);

      assertEquals(output.behavioral !== undefined, true);
      assertEquals(output.behavioral.rules.length > 0, true);
      assertEquals(typeof output.behavioral.tone, "string");
    }
  });

  it("EXECUTING behavioral says 'Orchestrate immediately'", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);

    assertEquals(
      output.behavioral.tone.includes("Orchestrate immediately"),
      true,
    );
  });

  it("DISCOVERY behavioral tone is challenging", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);

    assertEquals(output.behavioral.tone.includes("stake in the answers"), true);
  });

  it("EXECUTING behavioral includes urgency when over iteration threshold", async () => {
    let state = inExecuting();
    for (let i = 0; i < 16; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }

    const config = schema.createInitialManifest([], [], [], {
      languages: [],
      frameworks: [],
      ci: [],
      testRunner: null,
    });
    const output = await compiler.compile(state, noConcerns, noRules, config);

    assertEquals(output.behavioral.urgency !== undefined, true);
    assertEquals(output.behavioral.urgency!.includes("degrading"), true);
  });

  it("EXECUTING behavioral omits urgency when under threshold", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);

    assertEquals(output.behavioral.urgency, undefined);
  });
});

// =============================================================================
// Agent discovery one-at-a-time
// =============================================================================

const QUESTION_IDS = [
  "status_quo",
  "ambition",
  "reversibility",
  "user_impact",
  "verification",
  "scope_boundary",
];

describe("agent discovery one-at-a-time", () => {
  const agentDiscovery = (): schema.StateFile => ({
    ...inDiscovery(),
    discovery: { ...inDiscovery().discovery, audience: "agent" },
  });

  it("--agent mode returns 1 question with currentQuestion=0", async () => {
    const output = await compiler.compile(
      agentDiscovery(),
      noConcerns,
      noRules,
    ) as compiler.DiscoveryOutput;

    assertEquals(output.phase, "DISCOVERY");
    assertEquals(output.questions.length, 1);
    assertEquals(output.currentQuestion, 0);
    assertEquals(output.totalQuestions, 6);
    assertEquals(output.questions[0]?.id, "status_quo");
  });

  it("--agent mode after answering Q1 returns Q2 with currentQuestion=1", async () => {
    let state = agentDiscovery();
    state = machine.addDiscoveryAnswer(
      state,
      "status_quo",
      "Users currently do X today and need improvement",
    );
    state = machine.advanceDiscoveryQuestion(state);

    const output = await compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.DiscoveryOutput;

    assertEquals(output.questions.length, 1);
    assertEquals(output.currentQuestion, 1);
    assertEquals(output.totalQuestions, 6);
    assertEquals(output.questions[0]?.id, "ambition");
  });

  it("--agent mode answer all 6 one by one transitions to DISCOVERY_REVIEW", () => {
    let state = agentDiscovery();

    for (const qId of QUESTION_IDS) {
      state = machine.addDiscoveryAnswer(
        state,
        qId,
        `Detailed answer for question ${qId}`,
      );
      state = machine.advanceDiscoveryQuestion(state);
    }

    assertEquals(questions.isDiscoveryComplete(state.discovery.answers), true);
    state = machine.completeDiscovery(state);
    assertEquals(state.phase, "DISCOVERY_REVIEW");
  });

  it("human mode (no --agent) returns all 6 questions", async () => {
    const output = await compiler.compile(
      inDiscovery(),
      noConcerns,
      noRules,
    ) as compiler.DiscoveryOutput;

    assertEquals(output.phase, "DISCOVERY");
    assertEquals(output.questions.length, 6);
    assertEquals(output.currentQuestion, undefined);
    assertEquals(output.totalQuestions, undefined);
  });

  it("human mode JSON answer with all 6 keys transitions to DISCOVERY_REVIEW", () => {
    let state = inDiscovery();

    for (const qId of QUESTION_IDS) {
      state = machine.addDiscoveryAnswer(
        state,
        qId,
        `Detailed answer for question ${qId}`,
      );
    }

    assertEquals(questions.isDiscoveryComplete(state.discovery.answers), true);
    state = machine.completeDiscovery(state);
    assertEquals(state.phase, "DISCOVERY_REVIEW");
  });
});

// =============================================================================
// DISCOVERY_REVIEW split proposal
// =============================================================================

describe("DISCOVERY_REVIEW split proposal", () => {
  const multiAreaReview = (): schema.StateFile => {
    let state = inDiscovery();
    state = machine.addDiscoveryAnswer(
      state,
      "status_quo",
      "(1) Log messages are too verbose and flood stdout (2) Bot chat responses use wrong gender pronouns",
    );
    state = machine.addDiscoveryAnswer(
      state,
      "ambition",
      "fix log levels AND restore bot gender detection",
    );
    state = machine.addDiscoveryAnswer(
      state,
      "reversibility",
      "all reversible — safe to undo at any point",
    );
    state = machine.addDiscoveryAnswer(
      state,
      "user_impact",
      "positive only — users will benefit from this change",
    );
    state = machine.addDiscoveryAnswer(
      state,
      "verification",
      "test without developer 1, verify no rchat errors",
    );
    state = machine.addDiscoveryAnswer(
      state,
      "scope_boundary",
      "no rchat.c rewrite allowed in this scope",
    );
    return machine.completeDiscovery(state);
  };

  const singleAreaReview = (): schema.StateFile => {
    let state = inDiscovery();
    state = machine.addDiscoveryAnswer(
      state,
      "status_quo",
      "cursor shader goes stale after hunk clear",
    );
    state = machine.addDiscoveryAnswer(
      state,
      "ambition",
      "extract RegisterAssets helper",
    );
    state = machine.addDiscoveryAnswer(
      state,
      "reversibility",
      "reversible — can roll back without data loss",
    );
    state = machine.addDiscoveryAnswer(
      state,
      "user_impact",
      "positive impact on daily workflow and productivity",
    );
    state = machine.addDiscoveryAnswer(
      state,
      "verification",
      "visual test plus automated regression suite",
    );
    state = machine.addDiscoveryAnswer(
      state,
      "scope_boundary",
      "no hunk clear changes",
    );
    return machine.completeDiscovery(state);
  };

  it("multi-area discovery includes splitProposal in output", async () => {
    const state = multiAreaReview();
    const output = await compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.DiscoveryReviewOutput;

    assertEquals(output.phase, "DISCOVERY_REVIEW");
    assertEquals(output.splitProposal !== undefined, true);
    assertEquals(output.splitProposal!.detected, true);
    assertEquals(output.splitProposal!.proposals.length >= 2, true);
  });

  it("single-area discovery omits splitProposal", async () => {
    const state = singleAreaReview();
    const output = await compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.DiscoveryReviewOutput;

    assertEquals(output.phase, "DISCOVERY_REVIEW");
    assertEquals(output.splitProposal, undefined);
  });

  it("approved + split shows split-specific instruction", async () => {
    const state = machine.approveDiscoveryAnswers(multiAreaReview());
    const output = await compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.DiscoveryReviewOutput;

    assertEquals(output.phase, "DISCOVERY_REVIEW");
    assertEquals(output.splitProposal !== undefined, true);
    assertEquals(output.splitProposal!.detected, true);
    assertEquals(output.instruction.includes("independent work areas"), true);
  });

  it("approved + split interactiveOptions has Keep/Split", async () => {
    const state = machine.approveDiscoveryAnswers(multiAreaReview());
    const output = await compiler.compile(state, noConcerns, noRules);

    const labels =
      (output as { interactiveOptions?: readonly { label: string }[] })
        .interactiveOptions?.map((o) => o.label) ?? [];
    assertEquals(labels.includes("Keep as one spec"), true);
    assertEquals(labels.includes("Split into separate specs"), true);
  });

  it("not-approved interactiveOptions has Approve/Revise", async () => {
    const state = multiAreaReview();
    const output = await compiler.compile(state, noConcerns, noRules);

    const labels =
      (output as { interactiveOptions?: readonly { label: string }[] })
        .interactiveOptions?.map((o) => o.label) ?? [];
    assertEquals(labels.includes("Approve all answers"), true);
    assertEquals(labels.includes("Revise answers"), true);
  });
});
