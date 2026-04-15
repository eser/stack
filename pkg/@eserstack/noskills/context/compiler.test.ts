// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
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
const securityAudited = allConcerns.find((c) => c.id === "security-audited")!;

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

  it("SPEC_PROPOSAL auto-infers classification instead of prompting", async () => {
    const state = inSpecDraft();

    // After approveDiscoveryReview, autoClassifyIfMissing populates classification.
    assertEquals(state.classification !== null, true);
    assertEquals(state.classification?.source, "inferred");

    const output = await compiler.compile(state, noConcerns, noRules);

    assertEquals(output.phase, "SPEC_PROPOSAL");
    const specDraft = output as compiler.SpecDraftOutput;
    assertEquals(specDraft.classificationRequired, undefined);
  });

  it("SPEC_PROPOSAL with classification shows approve transition", async () => {
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

    assertEquals(output.phase, "SPEC_PROPOSAL");
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

  it("--agent mode answer all 6 one by one transitions to DISCOVERY_REFINEMENT", () => {
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
    assertEquals(state.phase, "DISCOVERY_REFINEMENT");
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

  it("human mode JSON answer with all 6 keys transitions to DISCOVERY_REFINEMENT", () => {
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
    assertEquals(state.phase, "DISCOVERY_REFINEMENT");
  });
});

// =============================================================================
// DISCOVERY_REFINEMENT split proposal
// =============================================================================

describe("DISCOVERY_REFINEMENT split proposal", () => {
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

    assertEquals(output.phase, "DISCOVERY_REFINEMENT");
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

    assertEquals(output.phase, "DISCOVERY_REFINEMENT");
    assertEquals(output.splitProposal, undefined);
  });

  it("approved + split shows split-specific instruction", async () => {
    const state = machine.approveDiscoveryAnswers(multiAreaReview());
    const output = await compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.DiscoveryReviewOutput;

    assertEquals(output.phase, "DISCOVERY_REFINEMENT");
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

// =============================================================================
// inferClassification
// =============================================================================

const createTestState = (
  partial: Partial<schema.StateFile>,
): schema.StateFile => ({
  ...schema.createInitialState(),
  ...partial,
});

describe("inferClassification", () => {
  it("detects Web UI keywords", () => {
    const state = createTestState({
      specDescription: "add a loading state and button component",
    });
    const result = compiler.inferClassification(state);

    assertEquals(result.involvesWebUI, true);
    assertEquals(
      result.inferredFrom?.some((k) => k.startsWith("involvesWebUI:")) ?? false,
      true,
    );
  });

  it("detects CLI keywords", () => {
    const state = createTestState({
      specDescription: "update the terminal stdin prompt",
    });
    const result = compiler.inferClassification(state);

    assertEquals(result.involvesCLI, true);
  });

  it("detects API keywords", () => {
    const state = createTestState({
      specDescription: "add a REST endpoint with webhook",
    });
    const result = compiler.inferClassification(state);

    assertEquals(result.involvesPublicAPI, true);
  });

  it("detects Migration keywords", () => {
    const state = createTestState({
      specDescription: "migration and backward compat",
    });
    const result = compiler.inferClassification(state);

    assertEquals(result.involvesMigration, true);
  });

  it("detects Data Handling keywords", () => {
    const state = createTestState({
      specDescription: "handle PII with encrypt at rest",
    });
    const result = compiler.inferClassification(state);

    assertEquals(result.involvesDataHandling, true);
  });

  it("no keywords → all false", () => {
    const state = createTestState({
      specDescription: "refactor internal helper",
    });
    const result = compiler.inferClassification(state);

    assertEquals(result.involvesWebUI, false);
    assertEquals(result.involvesCLI, false);
    assertEquals(result.involvesPublicAPI, false);
    assertEquals(result.involvesMigration, false);
    assertEquals(result.involvesDataHandling, false);
    assertEquals(result.inferredFrom, []);
  });

  it('source is always "inferred"', () => {
    const state = createTestState({
      specDescription: "anything goes here",
    });
    const result = compiler.inferClassification(state);

    assertEquals(result.source, "inferred");
  });

  it("reads userContext array", () => {
    const state = createTestState({
      specDescription: null,
      discovery: {
        ...schema.createInitialState().discovery,
        userContext: ["loading state button"],
      },
    });
    const result = compiler.inferClassification(state);

    assertEquals(result.involvesWebUI, true);
  });

  it("reads discovery answers", () => {
    const state = createTestState({
      specDescription: null,
      discovery: {
        ...schema.createInitialState().discovery,
        answers: [
          { questionId: "status_quo", answer: "REST api endpoint" },
        ],
      },
    });
    const result = compiler.inferClassification(state);

    assertEquals(result.involvesPublicAPI, true);
  });

  it("combines all three sources", () => {
    const state = createTestState({
      specDescription: "migration",
      discovery: {
        ...schema.createInitialState().discovery,
        userContext: ["button"],
        answers: [
          { questionId: "status_quo", answer: "terminal" },
        ],
      },
    });
    const result = compiler.inferClassification(state);

    assertEquals(result.involvesMigration, true);
    assertEquals(result.involvesWebUI, true);
    assertEquals(result.involvesCLI, true);
  });

  it("matches 'migration' correctly", () => {
    const migrationState = createTestState({
      specDescription: "migration",
    });
    assertEquals(
      compiler.inferClassification(migrationState).involvesMigration,
      true,
    );

    const deprecatedState = createTestState({
      specDescription: "this API is deprecated",
    });
    assertEquals(
      compiler.inferClassification(deprecatedState).involvesMigration,
      true,
    );
  });
});

// =============================================================================
// Discovery Conduct Rules (Expansion E)
// =============================================================================

describe("Discovery Conduct Rules in DISCOVERY phase", () => {
  it("behavioral.rules contains global conduct rules for DISCOVERY", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const rules = output.behavioral.rules;

    // Global conduct rules: all 11 from DISCOVERY_CONDUCT_RULES
    assertEquals(
      rules.some((r) => r.includes("Interview the user relentlessly")),
      true,
    );
    assertEquals(
      rules.some((r) => r.includes("Ask questions ONE AT A TIME")),
      true,
    );
    assertEquals(
      rules.some((r) =>
        r.includes("Do NOT fill placeholders with assumptions")
      ),
      true,
    );
    assertEquals(
      rules.some((r) => r.includes("push back and ask for specifics")),
      true,
    );
  });

  it("concern-contributed conduct rules are appended after global rules", async () => {
    const concernWithRules: schema.ConcernDefinition = {
      id: "test-conduct",
      name: "Test Conduct",
      description: "Has conduct rules",
      extras: [],
      specSections: [],
      reminders: [],
      acceptanceCriteria: ["ok"],
      conductRules: {
        DISCOVERY: ["Ask about unique failure mode XYZ first."],
      },
    };

    const output = await compiler.compile(
      inDiscovery(),
      [concernWithRules],
      noRules,
    );
    const rules = output.behavioral.rules;

    // Global rule still present
    assertEquals(
      rules.some((r) => r.includes("Interview the user relentlessly")),
      true,
    );
    // Concern-contributed rule present
    assertEquals(
      rules.some((r) => r.includes("unique failure mode XYZ")),
      true,
    );
  });

  it("concern without conductRules is unaffected", async () => {
    const bareConern: schema.ConcernDefinition = {
      id: "bare",
      name: "Bare",
      description: "No conduct rules",
      extras: [],
      specSections: [],
      reminders: [],
      acceptanceCriteria: ["ok"],
    };

    const output = await compiler.compile(inDiscovery(), [bareConern], noRules);
    const rules = output.behavioral.rules;

    // Global rule still there, no surprise extra rules
    assertEquals(
      rules.some((r) => r.includes("Interview the user relentlessly")),
      true,
    );
  });

  it("DISCOVERY conduct rules do NOT appear in EXECUTING behavioral block", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const rules = output.behavioral.rules;
    // "Interview the user relentlessly" is discovery-specific, not general
    assertEquals(
      rules.some((r) => r.includes("Interview the user relentlessly")),
      false,
    );
  });
});

describe("Discovery Conduct Rules in DISCOVERY_REFINEMENT phase", () => {
  it("behavioral.rules contains global conduct rules for DISCOVERY_REFINEMENT", async () => {
    const output = await compiler.compile(
      inDiscoveryReview(),
      noConcerns,
      noRules,
    );
    const rules = output.behavioral.rules;

    assertEquals(
      rules.some((r) => r.includes("Interview the user relentlessly")),
      true,
    );
    assertEquals(
      rules.some((r) => r.includes("Ask questions ONE AT A TIME")),
      true,
    );
  });

  it("concern-contributed DISCOVERY_REFINEMENT rules are appended", async () => {
    const concernWithRefinementRules: schema.ConcernDefinition = {
      id: "refinement-concern",
      name: "Refinement",
      description: "Has refinement rules",
      extras: [],
      specSections: [],
      reminders: [],
      acceptanceCriteria: ["ok"],
      conductRules: {
        DISCOVERY_REFINEMENT: [
          "Double-check scope boundary in refinement XYZ.",
        ],
      },
    };

    const output = await compiler.compile(
      inDiscoveryReview(),
      [concernWithRefinementRules],
      noRules,
    );
    const rules = output.behavioral.rules;

    assertEquals(
      rules.some((r) =>
        r.includes("Double-check scope boundary in refinement XYZ")
      ),
      true,
    );
  });
});

// =============================================================================
// buildGate for DISCOVERY_REFINEMENT (Completeness Gate)
// =============================================================================

describe("buildGate for DISCOVERY_REFINEMENT completeness", () => {
  it("gate message says 'Spec incomplete' when placeholders remain", async () => {
    const stateWithPlaceholder: schema.StateFile = {
      ...inDiscoveryReview(),
      specState: {
        path: "spec/test-spec",
        status: "draft",
        metadata: schema.EMPTY_SPEC_METADATA,
        placeholders: [
          {
            sectionId: "summary",
            sectionTitle: "Summary",
            status: "placeholder",
          },
        ],
      },
    };

    const output = await compiler.compile(
      stateWithPlaceholder,
      noConcerns,
      noRules,
    );
    assertEquals(output.gate !== undefined, true);
    assertEquals(output.gate?.message.includes("incomplete"), true);
    assertEquals(
      output.gate?.action.includes("Resolve every placeholder"),
      true,
    );
    assertEquals(output.gate?.action.includes("Summary"), true);
  });

  it("gate says 'All sections resolved' when spec is complete", async () => {
    const stateComplete: schema.StateFile = {
      ...inDiscoveryReview(),
      specState: {
        path: "spec/test-spec",
        status: "draft",
        metadata: schema.EMPTY_SPEC_METADATA,
        placeholders: [
          { sectionId: "summary", sectionTitle: "Summary", status: "filled" },
        ],
      },
    };

    const output = await compiler.compile(stateComplete, noConcerns, noRules);
    assertEquals(output.gate !== undefined, true);
    assertEquals(output.gate?.message.includes("All sections resolved"), true);
  });

  it("gate message is undefined for EXECUTING phase (no gate)", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    assertEquals(output.gate, undefined);
  });
});

// =============================================================================
// modeDirective — phase mapping
// =============================================================================

describe("modeDirective — phase mapping", () => {
  it("IDLE output has modeDirective containing 'No active spec'", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);
    assertEquals(typeof output.modeDirective, "string");
    assertEquals(output.modeDirective!.includes("No active spec"), true);
  });

  it("DISCOVERY output has modeDirective containing 'plan mode'", async () => {
    const state = machine.startSpec(
      idle(),
      "test-spec",
      "spec/test-spec",
      "A spec with description",
    );
    // Supply userContext to skip listen-first and reach normal DISCOVERY
    const stateWithCtx: schema.StateFile = {
      ...state,
      discovery: {
        ...state.discovery,
        userContext: ["some context"],
        mode: "full" as const,
      },
    };
    const output = await compiler.compile(stateWithCtx, noConcerns, noRules);
    assertEquals(typeof output.modeDirective, "string");
    assertEquals(output.modeDirective!.includes("plan mode"), true);
  });

  it("DISCOVERY_REFINEMENT output has modeDirective containing 'plan mode'", async () => {
    const output = await compiler.compile(
      inDiscoveryReview(),
      noConcerns,
      noRules,
    );
    assertEquals(typeof output.modeDirective, "string");
    assertEquals(output.modeDirective!.includes("plan mode"), true);
  });

  it("SPEC_PROPOSAL output has modeDirective containing 'plan mode'", async () => {
    const output = await compiler.compile(inSpecDraft(), noConcerns, noRules);
    assertEquals(typeof output.modeDirective, "string");
    assertEquals(output.modeDirective!.includes("plan mode"), true);
  });

  it("SPEC_APPROVED output has modeDirective containing 'Exit plan mode'", async () => {
    const output = await compiler.compile(
      inSpecApproved(),
      noConcerns,
      noRules,
    );
    assertEquals(typeof output.modeDirective, "string");
    assertEquals(output.modeDirective!.includes("Exit plan mode"), true);
  });

  it("EXECUTING output has modeDirective containing 'exited plan mode'", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    assertEquals(typeof output.modeDirective, "string");
    assertEquals(output.modeDirective!.includes("exited plan mode"), true);
  });

  it("BLOCKED output has modeDirective containing 'plan mode'", async () => {
    const output = await compiler.compile(inBlocked(), noConcerns, noRules);
    assertEquals(typeof output.modeDirective, "string");
    assertEquals(output.modeDirective!.includes("plan mode"), true);
  });

  it("COMPLETED output has modeDirective containing 'optional'", async () => {
    const output = await compiler.compile(inCompleted(), noConcerns, noRules);
    assertEquals(typeof output.modeDirective, "string");
    assertEquals(output.modeDirective!.includes("optional"), true);
  });

  it("UNINITIALIZED output does NOT have modeDirective field", async () => {
    const uninit: schema.StateFile = {
      ...schema.createInitialState(),
      phase: "UNINITIALIZED" as schema.Phase,
    };
    const output = await compiler.compile(uninit, noConcerns, noRules);
    assertEquals("modeDirective" in output, false);
  });
});

// =============================================================================
// detectActivePlan
// =============================================================================

describe("detectActivePlan", () => {
  it("file at plan.md with recent mtime returns DetectedPlan", async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const planContent =
        "## My Feature\nBuild X for users who need Y.\nThis is the third line.";
      await crossRuntime.runtime.fs.writeTextFile(
        `${tmpDir}/plan.md`,
        planContent,
      );

      const result = await compiler.detectActivePlan(tmpDir);
      assertEquals(result !== null, true);
      assertEquals(result!.path, `${tmpDir}/plan.md`);
      assertEquals(typeof result!.ageLabel, "string");
      assertEquals(typeof result!.preview, "string");
      assertEquals(
        result!.quality === "ok" || result!.quality === "sparse",
        true,
      );
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  it("file at plan.md with mtime >24h ago returns null", async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      await crossRuntime.runtime.fs.writeTextFile(
        `${tmpDir}/plan.md`,
        "## Old plan\nContent here.",
      );
      // Back-date the file by 25h using Deno.utime
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await Deno.utime(`${tmpDir}/plan.md`, oldTime, oldTime);

      const result = await compiler.detectActivePlan(tmpDir);
      assertEquals(result, null);
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  it("no plan file returns null", async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const result = await compiler.detectActivePlan(tmpDir);
      assertEquals(result, null);
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  it("plan with >=100 non-WS chars AND ## heading → quality === 'ok'", async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      // Build content with >= 100 non-whitespace chars and a ## heading
      const planContent =
        "## Feature Overview\nThis feature enables users to upload files through the drag-and-drop interface with validation and preview support.";
      await crossRuntime.runtime.fs.writeTextFile(
        `${tmpDir}/plan.md`,
        planContent,
      );

      const result = await compiler.detectActivePlan(tmpDir);
      assertEquals(result !== null, true);
      assertEquals(result!.quality, "ok");
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  it("plan with ## heading but <100 non-WS chars → quality === 'sparse' (AND enforced)", async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      // Has heading but very short — under 100 non-WS chars
      const planContent = "## Tasks\nDo stuff.";
      await crossRuntime.runtime.fs.writeTextFile(
        `${tmpDir}/plan.md`,
        planContent,
      );

      const result = await compiler.detectActivePlan(tmpDir);
      assertEquals(result !== null, true);
      assertEquals(result!.quality, "sparse");
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  it("file <60s old → ageLabel === 'just now'", async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const planContent =
        "## Fresh Plan\nThis was written seconds ago with enough content to be substantial.";
      await crossRuntime.runtime.fs.writeTextFile(
        `${tmpDir}/plan.md`,
        planContent,
      );

      const result = await compiler.detectActivePlan(tmpDir);
      assertEquals(result !== null, true);
      assertEquals(result!.ageLabel, "just now");
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });
});

// =============================================================================
// activePlanDetected in listen-first
// =============================================================================

describe("activePlanDetected in listen-first", () => {
  const inDiscoveryWithDesc = (): schema.StateFile =>
    machine.startSpec(idle(), "test-spec", "spec/test-spec", "Build a feature");

  it("listen-first + detected plan → DiscoveryOutput has activePlanDetected", async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      const planContent =
        "## My Plan\nThis contains enough content to qualify as an ok quality plan for testing purposes here.";
      await crossRuntime.runtime.fs.writeTextFile(
        `${tmpDir}/plan.md`,
        planContent,
      );

      const output = await compiler.compile(
        inDiscoveryWithDesc(),
        noConcerns,
        noRules,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        tmpDir,
      ) as compiler.DiscoveryOutput;

      assertEquals(output.activePlanDetected !== undefined, true);
      assertEquals(output.activePlanDetected!.path, `${tmpDir}/plan.md`);
      assertEquals(typeof output.activePlanDetected!.age, "string");
      assertEquals(typeof output.activePlanDetected!.preview, "string");
      assertEquals(
        output.activePlanDetected!.quality === "ok" ||
          output.activePlanDetected!.quality === "sparse",
        true,
      );
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  it("detected sparse plan → listen-first instruction contains '⚠' warning", async () => {
    const tmpDir = await Deno.makeTempDir();
    try {
      // Sparse: has heading but well under 100 non-WS chars
      await crossRuntime.runtime.fs.writeTextFile(
        `${tmpDir}/plan.md`,
        "## Tasks\nTodo.",
      );

      const output = await compiler.compile(
        inDiscoveryWithDesc(),
        noConcerns,
        noRules,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        tmpDir,
      ) as compiler.DiscoveryOutput;

      assertEquals(output.instruction.includes("⚠"), true);
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  it("planPath !== null in state → DiscoveryOutput has planImported: true", async () => {
    const base = machine.startSpec(
      idle(),
      "test-spec",
      "spec/test-spec",
      "A spec",
    );
    // Simulate plan already imported into state
    const stateWithPlan: schema.StateFile = {
      ...base,
      discovery: {
        ...base.discovery,
        planPath: "/some/plan.md",
        userContext: ["plan content here"],
        mode: "full" as const,
      },
    };

    const output = await compiler.compile(
      stateWithPlan,
      noConcerns,
      noRules,
    ) as compiler.DiscoveryOutput;

    assertEquals((output as compiler.DiscoveryOutput).planImported, true);
  });
});

// =============================================================================
// DISCOVERY_REFINEMENT: 3-Stage Behavioral Logic
// =============================================================================

const testScore: schema.CompletenessScore = {
  overall: 7,
  dimensions: [{ id: "problem-clarity", score: 7, notes: "clear" }],
  gaps: ["missing test coverage"],
  assessedAt: "2026-04-07T00:00:00.000Z",
};

const testReadiness: schema.CeoReviewReadiness = {
  overall: 8,
  dimensions: [{ id: "premise-clarity", score: 8, notes: "solid" }],
  verdict: "approved",
};

const inStageA = (): schema.StateFile => inDiscoveryReview();
const inStageC = (): schema.StateFile =>
  machine.setCeoReviewReadiness(
    machine.setReviewPosture(inDiscoveryReview(), "selective-expansion"),
    testReadiness,
  );

describe("DISCOVERY_REFINEMENT Stage A — completeness + posture selection", () => {
  it("behavioral.rules include completeness assessment instructions", async () => {
    const output = await compiler.compile(inStageA(), noConcerns, noRules);
    assertEquals(
      output.behavioral.rules.some((r) =>
        r.includes("COMPLETENESS ASSESSMENT")
      ),
      true,
    );
  });

  it("behavioral.rules include posture selection options a/b/c/d", async () => {
    const output = await compiler.compile(inStageA(), noConcerns, noRules);
    assertEquals(
      output.behavioral.rules.some((r) =>
        r.includes("Selective expansion") && r.includes("Hold scope")
      ),
      true,
    );
  });

  it("subPhase is 'stage-a' in DiscoveryReviewOutput", async () => {
    const output = await compiler.compile(
      inStageA(),
      noConcerns,
      noRules,
    ) as compiler.DiscoveryReviewOutput;
    assertEquals(output.subPhase, "stage-a");
  });

  it("injects defaultReviewPosture message when manifest has default", async () => {
    const base = schema.createInitialManifest([], ["claude-code"], [
      "anthropic",
    ], {
      languages: [],
      frameworks: [],
      ci: [],
      testRunner: null,
    });
    const configWithDefault: schema.NosManifest = {
      ...base,
      defaultReviewPosture: "hold-scope",
    };
    const output = await compiler.compile(
      inStageA(),
      noConcerns,
      noRules,
      configWithDefault,
    );
    assertEquals(
      output.behavioral.rules.some((r) =>
        r.includes("project default posture")
      ),
      true,
    );
  });

  it("injects auto-posture suggestion when security-audited concern is active", async () => {
    const output = await compiler.compile(
      inStageA(),
      [securityAudited],
      noRules,
    );
    assertEquals(
      output.behavioral.rules.some((r) => r.includes("suggested posture")),
      true,
    );
  });

  it("injects conflict warning when multiple concerns suggest different postures", async () => {
    // security-audited: selective-expansion, compliance: hold-scope → conflict
    const output = await compiler.compile(
      inStageA(),
      [securityAudited, compliance],
      noRules,
    );
    assertEquals(
      output.behavioral.rules.some((r) => r.includes("different postures")),
      true,
    );
  });
});

describe("DISCOVERY_REFINEMENT Stage B — posture-guided review", () => {
  it("selective-expansion posture injects selective-expansion rule", async () => {
    const state = machine.setReviewPosture(
      inDiscoveryReview(),
      "selective-expansion",
    );
    const output = await compiler.compile(state, noConcerns, noRules);
    assertEquals(
      output.behavioral.rules.some((r) => r.includes("Selective expansion")),
      true,
    );
  });

  it("hold-scope posture injects hold-scope rule and abbreviated CEO review", async () => {
    const state = machine.setReviewPosture(inDiscoveryReview(), "hold-scope");
    const output = await compiler.compile(state, noConcerns, noRules);
    assertEquals(
      output.behavioral.rules.some((r) => r.includes("Hold scope")),
      true,
    );
    // hold-scope = abbreviated — does NOT include the extended-only rules
    assertEquals(
      output.behavioral.rules.some((r) =>
        r.includes("CEO REVIEW — REUSE SCORE")
      ),
      false,
    );
    assertEquals(
      output.behavioral.rules.some((r) =>
        r.includes("CEO REVIEW — FAILURE MODE REGISTRY")
      ),
      false,
    );
  });

  it("scope-expansion posture injects scope-expansion rule", async () => {
    const state = machine.setReviewPosture(
      inDiscoveryReview(),
      "scope-expansion",
    );
    const output = await compiler.compile(state, noConcerns, noRules);
    assertEquals(
      output.behavioral.rules.some((r) => r.includes("Scope expansion")),
      true,
    );
  });

  it("scope-reduction posture injects scope-reduction rule", async () => {
    const state = machine.setReviewPosture(
      inDiscoveryReview(),
      "scope-reduction",
    );
    const output = await compiler.compile(state, noConcerns, noRules);
    assertEquals(
      output.behavioral.rules.some((r) => r.includes("Scope reduction")),
      true,
    );
  });

  it("re-assessment rule present when completenessScore is set", async () => {
    const state = machine.setCompletenessScore(
      machine.setReviewPosture(inDiscoveryReview(), "selective-expansion"),
      testScore,
    );
    const output = await compiler.compile(state, noConcerns, noRules);
    assertEquals(
      output.behavioral.rules.some((r) => r.includes("RE-ASSESSMENT")),
      true,
    );
  });
});

describe("DISCOVERY_REFINEMENT Stage C — CEO review done, final decision", () => {
  it("behavioral.rules include stage-c decision prompt", async () => {
    const output = await compiler.compile(inStageC(), noConcerns, noRules);
    assertEquals(
      output.behavioral.rules.some((r) => r.includes("CEO review is complete")),
      true,
    );
  });

  it("subPhase is 'stage-c' when ceoReview is present", async () => {
    const output = await compiler.compile(
      inStageC(),
      noConcerns,
      noRules,
    ) as compiler.DiscoveryReviewOutput;
    assertEquals(output.subPhase, "stage-c");
  });

  it("stage-b tone is posture-guided", async () => {
    const stageB = machine.setReviewPosture(
      inDiscoveryReview(),
      "selective-expansion",
    );
    const output = await compiler.compile(stageB, noConcerns, noRules);
    assertEquals(output.behavioral.tone.includes("posture"), true);
  });
});

describe("DiscoveryReviewOutput exp-5: completenessScore and reviewPosture", () => {
  it("completenessScore and reviewPosture are populated from refinement sub-state", async () => {
    const state = machine.setCompletenessScore(
      machine.setReviewPosture(inDiscoveryReview(), "selective-expansion"),
      testScore,
    );
    const output = await compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.DiscoveryReviewOutput;
    assertEquals(output.completenessScore?.overall, 7);
    assertEquals(output.reviewPosture, "selective-expansion");
  });
});
