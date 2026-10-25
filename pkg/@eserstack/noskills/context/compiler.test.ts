// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as compiler from "./compiler.ts";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as questions from "./questions.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";
import * as cmd from "../output/cmd.ts";
import * as discoveryAnswers from "./discovery-answers.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = defaultConcerns.DEFAULT_CONCERNS;
const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];
const someRules = ["Use Deno", "No global state"];

// A tool with neither AskUserQuestion nor sub-agents, such as Cursor.
const noAskHints: compiler.InteractionHints = {
  hasAskUserTool: false,
  optionPresentation: "prose",
  hasSubAgentDelegation: false,
  subAgentMethod: "none",
};

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

// TASK-323: a state whose JSON has no "spec" key used to print commands as
// "spec undefined <subcommand>".
bdd.it("compile never names an undefined spec", async () => {
  const { spec: _dropped, ...withoutSpec } = inDiscovery();
  const output = await compiler.compile(
    withoutSpec as unknown as schema.StateFile,
    noConcerns,
    noRules,
  );

  assert.assertEquals(JSON.stringify(output).includes("spec undefined"), false);
});

// =============================================================================
// compile
// =============================================================================

bdd.describe("compile", () => {
  bdd.it("IDLE returns IdleOutput with instruction", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);

    assert.assertEquals(output.phase, "IDLE");
    assert.assertEquals("instruction" in output, true);
  });

  bdd.it(
    "DISCOVERY with unanswered returns DiscoveryOutput with next question",
    async () => {
      const output = await compiler.compile(inDiscovery(), noConcerns, noRules);

      assert.assertEquals(output.phase, "DISCOVERY");
      const discovery = output as compiler.DiscoveryOutput;
      assert.assertEquals(discovery.questions.length, 6);
      assert.assertEquals(discovery.questions[0]?.id, "status_quo");
    },
  );

  bdd.it(
    "DISCOVERY includes rules and concern reminders in context",
    async () => {
      const output = (await compiler.compile(
        inDiscovery(),
        [openSource],
        someRules,
      )) as compiler.DiscoveryOutput;

      assert.assertEquals(output.context.rules.length, 2);
      assert.assertEquals(output.context.concernReminders.length > 0, true);
    },
  );

  bdd.it("DISCOVERY includes concern extras in question", async () => {
    const output = (await compiler.compile(
      inDiscovery(),
      [openSource],
      noRules,
    )) as compiler.DiscoveryOutput;

    // open-source adds an extra to status_quo question
    assert.assertEquals((output.questions[0]?.extras.length ?? 0) > 0, true);
  });

  bdd.it(
    "SPEC_PROPOSAL auto-infers classification instead of prompting",
    async () => {
      const state = inSpecDraft();

      // After approveDiscoveryReview, autoClassifyIfMissing populates classification.
      assert.assertEquals(state.classification !== null, true);
      assert.assertEquals(state.classification?.source, "inferred");

      const output = await compiler.compile(state, noConcerns, noRules);

      assert.assertEquals(output.phase, "SPEC_PROPOSAL");
      const specDraft = output as compiler.SpecDraftOutput;
      assert.assertEquals(specDraft.classificationRequired, undefined);
    },
  );

  bdd.it(
    "SPEC_PROPOSAL with classification shows approve transition",
    async () => {
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

      assert.assertEquals(output.phase, "SPEC_PROPOSAL");
      const specDraft = output as compiler.SpecDraftOutput;
      assert.assertEquals(specDraft.classificationRequired, undefined);
      assert.assertEquals(
        specDraft.transition.onApprove.includes("approve"),
        true,
      );
    },
  );

  bdd.it(
    "SPEC_APPROVED returns SpecApprovedOutput with onStart transition",
    async () => {
      const output = await compiler.compile(
        inSpecApproved(),
        noConcerns,
        noRules,
      );

      assert.assertEquals(output.phase, "SPEC_APPROVED");
      const approved = output as compiler.SpecApprovedOutput;
      assert.assertEquals(approved.specPath, ".eser/specs/test-spec/spec.md");
      assert.assertEquals(
        approved.transition.onStart.includes("noskills spec"),
        true,
      );
    },
  );

  bdd.it("EXECUTING returns ExecutionOutput with iteration", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);

    assert.assertEquals(output.phase, "EXECUTING");
    const exec = output as compiler.ExecutionOutput;
    assert.assertEquals(exec.transition.iteration, 0);
  });

  bdd.it("EXECUTING with tensions includes concernTensions array", async () => {
    const output = (await compiler.compile(
      inExecuting(),
      [moveFast, compliance],
      noRules,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(output.concernTensions !== undefined, true);
    assert.assertEquals(output.concernTensions!.length, 1);
  });

  bdd.it("BLOCKED returns BlockedOutput with reason", async () => {
    const output = await compiler.compile(inBlocked(), noConcerns, noRules);

    assert.assertEquals(output.phase, "BLOCKED");
    const blocked = output as compiler.BlockedOutput;
    assert.assertEquals(blocked.reason, "BLOCKED: need API key");
  });

  bdd.it("COMPLETED returns CompletedOutput with summary", async () => {
    const output = await compiler.compile(inCompleted(), noConcerns, noRules);

    assert.assertEquals(output.phase, "COMPLETED");
    const completed = output as compiler.CompletedOutput;
    assert.assertEquals(completed.summary.spec, "test-spec");
    assert.assertEquals(completed.summary.iterations, 0);
    assert.assertEquals(completed.summary.decisionsCount, 0);
  });

  bdd.it("UNINITIALIZED falls through to IdleOutput", async () => {
    const state = { ...idle(), phase: "UNINITIALIZED" as schema.Phase };
    const output = await compiler.compile(state, noConcerns, noRules);

    assert.assertEquals(output.phase, "IDLE");
  });

  bdd.it("every output includes meta block with resumeHint", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);

    assert.assertEquals(output.meta !== undefined, true);
    assert.assertEquals(output.meta.spec, "test-spec");
    assert.assertEquals(typeof output.meta.resumeHint, "string");
    assert.assertEquals(output.meta.resumeHint.length > 0, true);
  });

  bdd.it(
    "includes protocolGuide on first call (lastCalledAt null)",
    async () => {
      // Default state has lastCalledAt: null
      const output = await compiler.compile(idle(), noConcerns, noRules);

      assert.assertEquals(output.protocolGuide !== undefined, true);
      assert.assertEquals(output.protocolGuide!.currentPhase, "IDLE");
    },
  );

  bdd.it("omits protocolGuide when lastCalledAt is recent", async () => {
    const recentState = {
      ...idle(),
      lastCalledAt: new Date().toISOString(),
    };
    const output = await compiler.compile(recentState, noConcerns, noRules);

    assert.assertEquals(output.protocolGuide, undefined);
  });

  bdd.it(
    "includes protocolGuide when lastCalledAt is stale (>5 min)",
    async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const staleState = { ...idle(), lastCalledAt: staleTime };
      const output = await compiler.compile(staleState, noConcerns, noRules);

      assert.assertEquals(output.protocolGuide !== undefined, true);
    },
  );

  bdd.it(
    "EXECUTING includes restartRecommended when over threshold",
    async () => {
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
      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
        config,
      )) as compiler.ExecutionOutput & { meta: compiler.MetaBlock };

      assert.assertEquals(output.restartRecommended, true);
      // The flag is for the formatter and dashboards; no prose goes to the agent.
      assert.assertEquals("restartInstruction" in output, false);
    },
  );

  bdd.it(
    "EXECUTING omits restartRecommended when under threshold",
    async () => {
      const output = (await compiler.compile(
        inExecuting(),
        noConcerns,
        noRules,
      )) as compiler.ExecutionOutput & { meta: compiler.MetaBlock };

      assert.assertEquals(output.restartRecommended, undefined);
    },
  );

  bdd.it(
    "every output includes behavioral block with rules and tone",
    async () => {
      const phases = [
        idle(),
        inDiscovery(),
        inSpecDraft(),
        inSpecApproved(),
        inExecuting(),
        inBlocked(),
        inCompleted(),
      ];

      const outputs = await Promise.all(
        phases.map((state) => compiler.compile(state, noConcerns, noRules)),
      );

      for (const output of outputs) {
        assert.assertEquals(output.behavioral !== undefined, true);
        assert.assertEquals(output.behavioral.rules.length > 0, true);
        assert.assertEquals(typeof output.behavioral.tone, "string");
      }
    },
  );

  bdd.it("EXECUTING behavioral says 'Orchestrate immediately'", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);

    assert.assertEquals(
      output.behavioral.tone.includes("Orchestrate immediately"),
      true,
    );
  });

  bdd.it("DISCOVERY behavioral tone is challenging", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);

    assert.assertEquals(
      output.behavioral.tone.includes("stake in the answers"),
      true,
    );
  });

  bdd.it(
    "EXECUTING behavioral has no urgency over the iteration threshold",
    async () => {
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

      assert.assertEquals("urgency" in output.behavioral, false);
      assert.assertEquals(
        output.behavioral.rules.some((r) => r.includes("degrading")),
        false,
      );
    },
  );

  bdd.it("SPEC_PROPOSAL states the read-only rule once", async () => {
    const output = await compiler.compile(inSpecDraft(), noConcerns, noRules);
    const readOnly = output.behavioral.rules.filter((r) =>
      r.includes("This phase is read-only"),
    );

    assert.assertEquals(readOnly.length, 1);
    assert.assertEquals(
      output.behavioral.rules.some((r) =>
        r.includes("DO NOT create, edit, or write any files"),
      ),
      false,
    );
    assert.assertEquals(output.behavioral.modeOverride, "plan mode");
  });
});

// =============================================================================
// Agent discovery: base questions together, follow-ups one at a time
// =============================================================================

const QUESTION_IDS = [
  "status_quo",
  "ambition",
  "reversibility",
  "user_impact",
  "verification",
  "scope_boundary",
];

bdd.describe("agent discovery: base questions together", () => {
  const agentDiscovery = (): schema.StateFile => ({
    ...inDiscovery(),
    discovery: { ...inDiscovery().discovery, audience: "agent" },
  });

  bdd.it("returns every base question with one instruction", async () => {
    const output = (await compiler.compile(
      agentDiscovery(),
      noConcerns,
      noRules,
    )) as compiler.DiscoveryOutput;

    assert.assertEquals(output.phase, "DISCOVERY");
    assert.assertEquals(
      output.questions.map((q) => q.id),
      QUESTION_IDS,
    );
    assert.assertEquals(output.totalQuestions, 6);
    assert.assertEquals("currentQuestion" in output, false);
    assert.assertStringIncludes(
      output.instruction,
      "Ask the user these 6 discovery questions together",
    );
    assert.assertStringIncludes(output.instruction, "one JSON object");
  });

  bdd.it("asks for one JSON answer keyed by the question ids", async () => {
    const output = (await compiler.compile(
      agentDiscovery(),
      noConcerns,
      noRules,
    )) as compiler.DiscoveryOutput;

    const submit = output.transition.onComplete;
    assert.assertStringIncludes(submit, "next --agent --answer='");
    const json = submit.slice(submit.indexOf("'") + 1, submit.lastIndexOf("'"));
    assert.assertEquals(Object.keys(JSON.parse(json)), QUESTION_IDS);
    assert.assertStringIncludes(output.instruction, submit);
  });

  bdd.it(
    "returns only the questions still open after some answers",
    async () => {
      let state = agentDiscovery();
      state = machine.addDiscoveryAnswer(
        state,
        "status_quo",
        "Users currently do X today and need improvement",
      );
      state = machine.addDiscoveryAnswer(
        state,
        "ambition",
        "1-star: manual upload; 10-star: drag and drop with previews",
      );

      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
      )) as compiler.DiscoveryOutput;

      const open = QUESTION_IDS.slice(2);
      assert.assertEquals(
        output.questions.map((q) => q.id),
        open,
      );
      assert.assertEquals(output.answeredCount, 2);
      assert.assertStringIncludes(
        output.instruction,
        "these 4 discovery questions together",
      );
      const submit = output.transition.onComplete;
      const json = submit.slice(
        submit.indexOf("'") + 1,
        submit.lastIndexOf("'"),
      );
      assert.assertEquals(Object.keys(JSON.parse(json)), open);
    },
  );

  const askCases: readonly {
    readonly name: string;
    readonly hints: compiler.InteractionHints;
    readonly answered: number;
    readonly expected: string;
  }[] = [
    {
      name: "six questions take AskUserQuestion calls of up to 4",
      hints: { ...noAskHints, hasAskUserTool: true },
      answered: 0,
      expected: "through AskUserQuestion, up to 4 questions per call",
    },
    {
      name: "up to 4 questions fit one AskUserQuestion call",
      hints: { ...noAskHints, hasAskUserTool: true },
      answered: 2,
      expected: "together in one AskUserQuestion call",
    },
    {
      name: "a tool without AskUserQuestion lists them in one message",
      hints: noAskHints,
      answered: 0,
      expected: "together in one message, as a numbered list",
    },
    {
      name: "the last question is asked on its own",
      hints: noAskHints,
      answered: 5,
      expected: "Ask the user this discovery question and wait for the answer.",
    },
  ];

  for (const { name, hints, answered, expected } of askCases) {
    bdd.it(name, async () => {
      let state = agentDiscovery();
      for (const qId of QUESTION_IDS.slice(0, answered)) {
        state = machine.addDiscoveryAnswer(
          state,
          qId,
          `Detailed answer for question ${qId}`,
        );
      }

      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
        undefined,
        undefined,
        undefined,
        undefined,
        hints,
      )) as compiler.DiscoveryOutput;

      assert.assertStringIncludes(output.instruction, expected);
    });
  }

  bdd.it("human mode (no --agent) returns all 6 questions", async () => {
    const output = (await compiler.compile(
      inDiscovery(),
      noConcerns,
      noRules,
    )) as compiler.DiscoveryOutput;

    assert.assertEquals(output.phase, "DISCOVERY");
    assert.assertEquals(output.questions.length, 6);
    assert.assertStringIncludes(
      output.instruction,
      "ask the unanswered discovery questions together",
    );
  });

  bdd.it(
    "human mode JSON answer with all 6 keys transitions to DISCOVERY_REFINEMENT",
    () => {
      let state = inDiscovery();

      for (const qId of QUESTION_IDS) {
        state = machine.addDiscoveryAnswer(
          state,
          qId,
          `Detailed answer for question ${qId}`,
        );
      }

      assert.assertEquals(
        questions.isDiscoveryComplete(state.discovery.answers),
        true,
      );
      state = machine.completeDiscovery(state);
      assert.assertEquals(state.phase, "DISCOVERY_REFINEMENT");
    },
  );
});

bdd.describe("discovery follow-ups: one at a time", () => {
  const answeredWithFollowUps = (
    audience: "agent" | "human",
  ): schema.StateFile => {
    let state: schema.StateFile = {
      ...inDiscovery(),
      discovery: { ...inDiscovery().discovery, audience },
    };
    for (const qId of QUESTION_IDS) {
      state = machine.addDiscoveryAnswer(
        state,
        qId,
        `Detailed answer for question ${qId}`,
      );
    }
    state = machine.addFollowUp(
      state,
      "reversibility",
      "What is the rollback plan?",
      "agent",
    );
    return machine.addFollowUp(
      state,
      "user_impact",
      "Which users notice the change first?",
      "agent",
    );
  };

  for (const audience of ["agent", "human"] as const) {
    bdd.it(`${audience} mode returns the first follow-up alone`, async () => {
      const output = (await compiler.compile(
        answeredWithFollowUps(audience),
        noConcerns,
        noRules,
      )) as compiler.DiscoveryOutput;

      assert.assertEquals(output.phase, "DISCOVERY");
      assert.assertEquals(output.questions.length, 1);
      assert.assertEquals(output.questions[0]?.id, "reversibilitya");
      assert.assertEquals(
        output.questions[0]?.text,
        "What is the rollback plan?",
      );
      assert.assertEquals(output.pendingFollowUps?.length, 2);
      assert.assertEquals(
        output.transition.onComplete,
        cmd.cmd('spec test-spec followup reversibilitya --answer="<answer>"'),
      );
      assert.assertStringIncludes(
        output.instruction,
        cmd.cmd("spec test-spec followup reversibilitya --skip"),
      );
      assert.assertStringIncludes(
        output.instruction,
        "1 more follow-up comes after this one",
      );
    });
  }

  bdd.it("names the base question the follow-up belongs to", async () => {
    const output = (await compiler.compile(
      answeredWithFollowUps("agent"),
      noConcerns,
      noRules,
    )) as compiler.DiscoveryOutput;

    assert.assertStringIncludes(
      output.instruction,
      'the answer to "Does this change involve an irreversible decision?"',
    );
    assert.assertStringIncludes(
      output.instruction,
      "as the only question of an AskUserQuestion call",
    );
  });

  bdd.it("moves to the next follow-up once one is answered", async () => {
    const state = machine.answerFollowUp(
      answeredWithFollowUps("agent"),
      "reversibilitya",
      "Feature flag, off by default",
    );

    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.DiscoveryOutput;

    assert.assertEquals(
      output.questions.map((q) => q.id),
      ["user_impacta"],
    );
    assert.assertStringIncludes(
      output.instruction,
      "Discovery moves on to the review once this one is answered or skipped.",
    );
  });

  bdd.it(
    "lists pending follow-ups beside the base questions still open",
    async () => {
      let state: schema.StateFile = {
        ...inDiscovery(),
        discovery: { ...inDiscovery().discovery, audience: "agent" },
      };
      state = machine.addFollowUp(
        state,
        "status_quo",
        "How often does that happen?",
        "agent",
      );

      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
      )) as compiler.DiscoveryOutput;

      assert.assertEquals(output.questions.length, 6);
      assert.assertEquals(
        output.pendingFollowUps?.map((f) => f.id),
        ["status_quoa"],
      );
    },
  );
});

// =============================================================================
// DISCOVERY_REFINEMENT split proposal
// =============================================================================

bdd.describe("DISCOVERY_REFINEMENT split proposal", () => {
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

  bdd.it("multi-area discovery includes splitProposal in output", async () => {
    const state = multiAreaReview();
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.DiscoveryReviewOutput;

    assert.assertEquals(output.phase, "DISCOVERY_REFINEMENT");
    assert.assertEquals(output.splitProposal !== undefined, true);
    assert.assertEquals(output.splitProposal!.detected, true);
    assert.assertEquals(output.splitProposal!.proposals.length >= 2, true);
  });

  bdd.it("single-area discovery omits splitProposal", async () => {
    const state = singleAreaReview();
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.DiscoveryReviewOutput;

    assert.assertEquals(output.phase, "DISCOVERY_REFINEMENT");
    assert.assertEquals(output.splitProposal, undefined);
  });

  bdd.it("approved + split shows split-specific instruction", async () => {
    const state = machine.approveDiscoveryAnswers(multiAreaReview());
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.DiscoveryReviewOutput;

    assert.assertEquals(output.phase, "DISCOVERY_REFINEMENT");
    assert.assertEquals(output.splitProposal !== undefined, true);
    assert.assertEquals(output.splitProposal!.detected, true);
    assert.assertEquals(
      output.instruction.includes("independent work areas"),
      true,
    );
  });

  bdd.it("approved + split interactiveOptions has Keep/Split", async () => {
    const state = machine.approveDiscoveryAnswers(multiAreaReview());
    const output = await compiler.compile(state, noConcerns, noRules);

    const labels =
      (
        output as { interactiveOptions?: readonly { label: string }[] }
      ).interactiveOptions?.map((o) => o.label) ?? [];
    assert.assertEquals(labels.includes("Keep as one spec"), true);
    assert.assertEquals(labels.includes("Split into separate specs"), true);
  });

  bdd.it("not-approved interactiveOptions has Approve/Revise", async () => {
    const state = multiAreaReview();
    const output = await compiler.compile(state, noConcerns, noRules);

    const labels =
      (
        output as { interactiveOptions?: readonly { label: string }[] }
      ).interactiveOptions?.map((o) => o.label) ?? [];
    assert.assertEquals(labels.includes("Approve all answers"), true);
    assert.assertEquals(labels.includes("Revise answers"), true);
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

bdd.describe("inferClassification", () => {
  bdd.it("detects Web UI keywords", () => {
    const state = createTestState({
      specDescription: "add a loading state and button component",
    });
    const result = compiler.inferClassification(state);

    assert.assertEquals(result.involvesWebUI, true);
    assert.assertEquals(
      result.inferredFrom?.some((k) => k.startsWith("involvesWebUI:")) ?? false,
      true,
    );
  });

  bdd.it("detects CLI keywords", () => {
    const state = createTestState({
      specDescription: "update the terminal stdin prompt",
    });
    const result = compiler.inferClassification(state);

    assert.assertEquals(result.involvesCLI, true);
  });

  bdd.it("detects API keywords", () => {
    const state = createTestState({
      specDescription: "add a REST endpoint with webhook",
    });
    const result = compiler.inferClassification(state);

    assert.assertEquals(result.involvesPublicAPI, true);
  });

  bdd.it("detects Migration keywords", () => {
    const state = createTestState({
      specDescription: "migration and backward compat",
    });
    const result = compiler.inferClassification(state);

    assert.assertEquals(result.involvesMigration, true);
  });

  bdd.it("detects Data Handling keywords", () => {
    const state = createTestState({
      specDescription: "handle PII with encrypt at rest",
    });
    const result = compiler.inferClassification(state);

    assert.assertEquals(result.involvesDataHandling, true);
  });

  bdd.it("no keywords → all false", () => {
    const state = createTestState({
      specDescription: "refactor internal helper",
    });
    const result = compiler.inferClassification(state);

    assert.assertEquals(result.involvesWebUI, false);
    assert.assertEquals(result.involvesCLI, false);
    assert.assertEquals(result.involvesPublicAPI, false);
    assert.assertEquals(result.involvesMigration, false);
    assert.assertEquals(result.involvesDataHandling, false);
    assert.assertEquals(result.inferredFrom, []);
  });

  bdd.it('source is always "inferred"', () => {
    const state = createTestState({
      specDescription: "anything goes here",
    });
    const result = compiler.inferClassification(state);

    assert.assertEquals(result.source, "inferred");
  });

  bdd.it("reads userContext array", () => {
    const state = createTestState({
      specDescription: null,
      discovery: {
        ...schema.createInitialState().discovery,
        userContext: ["loading state button"],
      },
    });
    const result = compiler.inferClassification(state);

    assert.assertEquals(result.involvesWebUI, true);
  });

  bdd.it("reads discovery answers", () => {
    const state = createTestState({
      specDescription: null,
      discovery: {
        ...schema.createInitialState().discovery,
        answers: [{ questionId: "status_quo", answer: "REST api endpoint" }],
      },
    });
    const result = compiler.inferClassification(state);

    assert.assertEquals(result.involvesPublicAPI, true);
  });

  bdd.it("combines all three sources", () => {
    const state = createTestState({
      specDescription: "migration",
      discovery: {
        ...schema.createInitialState().discovery,
        userContext: ["button"],
        answers: [{ questionId: "status_quo", answer: "terminal" }],
      },
    });
    const result = compiler.inferClassification(state);

    assert.assertEquals(result.involvesMigration, true);
    assert.assertEquals(result.involvesWebUI, true);
    assert.assertEquals(result.involvesCLI, true);
  });

  bdd.it("matches 'migration' correctly", () => {
    const migrationState = createTestState({
      specDescription: "migration",
    });
    assert.assertEquals(
      compiler.inferClassification(migrationState).involvesMigration,
      true,
    );

    const deprecatedState = createTestState({
      specDescription: "this API is deprecated",
    });
    assert.assertEquals(
      compiler.inferClassification(deprecatedState).involvesMigration,
      true,
    );
  });
});

// =============================================================================
// Discovery Conduct Rules (Expansion E)
// =============================================================================

bdd.describe("Discovery Conduct Rules in DISCOVERY phase", () => {
  bdd.it(
    "behavioral.rules contains global conduct rules for DISCOVERY",
    async () => {
      const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
      const rules = output.behavioral.rules;

      // Global conduct rules: all 11 from DISCOVERY_CONDUCT_RULES
      assert.assertEquals(
        rules.some((r) => r.includes("Interview the user about each part")),
        true,
      );
      assert.assertEquals(
        rules.some((r) => r === discoveryAnswers.discoveryQuestionRule()),
        true,
      );
      assert.assertEquals(
        rules.some((r) =>
          r.includes("Do NOT fill placeholders with assumptions"),
        ),
        true,
      );
      assert.assertEquals(
        rules.some((r) => r.includes("push back and ask for specifics")),
        true,
      );
    },
  );

  bdd.it(
    "concern-contributed conduct rules are appended after global rules",
    async () => {
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
      assert.assertEquals(
        rules.some((r) => r.includes("Interview the user about each part")),
        true,
      );
      // Concern-contributed rule present
      assert.assertEquals(
        rules.some((r) => r.includes("unique failure mode XYZ")),
        true,
      );
    },
  );

  bdd.it("concern without conductRules is unaffected", async () => {
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
    assert.assertEquals(
      rules.some((r) => r.includes("Interview the user about each part")),
      true,
    );
  });

  bdd.it(
    "DISCOVERY conduct rules do NOT appear in EXECUTING behavioral block",
    async () => {
      const output = await compiler.compile(inExecuting(), noConcerns, noRules);
      const rules = output.behavioral.rules;
      // "Interview the user about each part" is discovery-specific, not general
      assert.assertEquals(
        rules.some((r) => r.includes("Interview the user about each part")),
        false,
      );
    },
  );
});

bdd.describe("Discovery Conduct Rules in DISCOVERY_REFINEMENT phase", () => {
  bdd.it(
    "behavioral.rules contains global conduct rules for DISCOVERY_REFINEMENT",
    async () => {
      const output = await compiler.compile(
        inDiscoveryReview(),
        noConcerns,
        noRules,
      );
      const rules = output.behavioral.rules;

      assert.assertEquals(
        rules.some((r) => r.includes("Interview the user about each part")),
        true,
      );
      assert.assertEquals(
        rules.some((r) => r === discoveryAnswers.discoveryQuestionRule()),
        true,
      );
    },
  );

  bdd.it(
    "concern-contributed DISCOVERY_REFINEMENT rules are appended",
    async () => {
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

      assert.assertEquals(
        rules.some((r) =>
          r.includes("Double-check scope boundary in refinement XYZ"),
        ),
        true,
      );
    },
  );
});

// =============================================================================
// buildGate for DISCOVERY_REFINEMENT (Completeness Gate)
// =============================================================================

bdd.describe("buildGate for DISCOVERY_REFINEMENT completeness", () => {
  bdd.it(
    "gate message says 'Spec incomplete' when placeholders remain",
    async () => {
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
      assert.assertEquals(output.gate !== undefined, true);
      assert.assertEquals(output.gate?.message.includes("incomplete"), true);
      assert.assertEquals(
        output.gate?.action.includes("Resolve every placeholder"),
        true,
      );
      assert.assertEquals(output.gate?.action.includes("Summary"), true);
      // TASK-325: the action names the command that resolves a section.
      assert.assertStringIncludes(
        output.gate?.action ?? "",
        'section <id> fill "text"',
      );
      assert.assertStringIncludes(
        output.gate?.action ?? "",
        'section <id> na "reason"',
      );
    },
  );

  bdd.it(
    "gate says 'All sections resolved' when spec is complete",
    async () => {
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
      assert.assertEquals(output.gate !== undefined, true);
      assert.assertEquals(
        output.gate?.message.includes("All sections resolved"),
        true,
      );
    },
  );

  bdd.it(
    "gate message is undefined for EXECUTING phase (no gate)",
    async () => {
      const output = await compiler.compile(inExecuting(), noConcerns, noRules);
      assert.assertEquals(output.gate, undefined);
    },
  );
});

// =============================================================================
// modeDirective — phase mapping
// =============================================================================

bdd.describe("modeDirective — phase mapping", () => {
  bdd.it(
    "IDLE output has modeDirective containing 'No active spec'",
    async () => {
      const output = await compiler.compile(idle(), noConcerns, noRules);
      assert.assertEquals(typeof output.modeDirective, "string");
      assert.assertEquals(
        output.modeDirective!.includes("No active spec"),
        true,
      );
    },
  );

  bdd.it(
    "DISCOVERY output has modeDirective containing 'plan mode'",
    async () => {
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
      assert.assertEquals(typeof output.modeDirective, "string");
      assert.assertEquals(output.modeDirective!.includes("plan mode"), true);
    },
  );

  bdd.it(
    "DISCOVERY_REFINEMENT output has modeDirective containing 'plan mode'",
    async () => {
      const output = await compiler.compile(
        inDiscoveryReview(),
        noConcerns,
        noRules,
      );
      assert.assertEquals(typeof output.modeDirective, "string");
      assert.assertEquals(output.modeDirective!.includes("plan mode"), true);
    },
  );

  bdd.it(
    "SPEC_PROPOSAL output has modeDirective containing 'plan mode'",
    async () => {
      const output = await compiler.compile(inSpecDraft(), noConcerns, noRules);
      assert.assertEquals(typeof output.modeDirective, "string");
      assert.assertEquals(output.modeDirective!.includes("plan mode"), true);
    },
  );

  bdd.it(
    "SPEC_APPROVED output has modeDirective containing 'Exit plan mode'",
    async () => {
      const output = await compiler.compile(
        inSpecApproved(),
        noConcerns,
        noRules,
      );
      assert.assertEquals(typeof output.modeDirective, "string");
      assert.assertEquals(
        output.modeDirective!.includes("Exit plan mode"),
        true,
      );
    },
  );

  bdd.it(
    "EXECUTING output has modeDirective containing 'exited plan mode'",
    async () => {
      const output = await compiler.compile(inExecuting(), noConcerns, noRules);
      assert.assertEquals(typeof output.modeDirective, "string");
      assert.assertEquals(
        output.modeDirective!.includes("exited plan mode"),
        true,
      );
    },
  );

  bdd.it(
    "BLOCKED output has modeDirective containing 'plan mode'",
    async () => {
      const output = await compiler.compile(inBlocked(), noConcerns, noRules);
      assert.assertEquals(typeof output.modeDirective, "string");
      assert.assertEquals(output.modeDirective!.includes("plan mode"), true);
    },
  );

  bdd.it(
    "COMPLETED output has modeDirective containing 'optional'",
    async () => {
      const output = await compiler.compile(inCompleted(), noConcerns, noRules);
      assert.assertEquals(typeof output.modeDirective, "string");
      assert.assertEquals(output.modeDirective!.includes("optional"), true);
    },
  );

  bdd.it("UNINITIALIZED output does NOT have modeDirective field", async () => {
    const uninit: schema.StateFile = {
      ...schema.createInitialState(),
      phase: "UNINITIALIZED" as schema.Phase,
    };
    const output = await compiler.compile(uninit, noConcerns, noRules);
    assert.assertEquals("modeDirective" in output, false);
  });
});

// =============================================================================
// detectActivePlan
// =============================================================================

bdd.describe("detectActivePlan", () => {
  bdd.it("file at plan.md with recent mtime returns DetectedPlan", async () => {
    const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
    try {
      const planContent =
        "## My Feature\nBuild X for users who need Y.\nThis is the third line.";
      await crossRuntime.runtime.fs.writeTextFile(
        `${tmpDir}/plan.md`,
        planContent,
      );

      const result = await compiler.detectActivePlan(tmpDir);
      assert.assertEquals(result !== null, true);
      assert.assertEquals(result!.path, `${tmpDir}/plan.md`);
      assert.assertEquals(typeof result!.ageLabel, "string");
      assert.assertEquals(typeof result!.preview, "string");
      assert.assertEquals(
        result!.quality === "ok" || result!.quality === "sparse",
        true,
      );
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  bdd.it("file at plan.md with mtime >24h ago returns null", async () => {
    const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
    try {
      await crossRuntime.runtime.fs.writeTextFile(
        `${tmpDir}/plan.md`,
        "## Old plan\nContent here.",
      );
      // Measure the age from 25h after now, so the file is 25h old.
      const result = await compiler.detectActivePlan(
        tmpDir,
        Date.now() + 25 * 60 * 60 * 1000,
      );
      assert.assertEquals(result, null);
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  bdd.it("no plan file returns null", async () => {
    const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
    try {
      const result = await compiler.detectActivePlan(tmpDir);
      assert.assertEquals(result, null);
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  bdd.it(
    "plan with >=100 non-WS chars AND ## heading → quality === 'ok'",
    async () => {
      const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
      try {
        // Build content with >= 100 non-whitespace chars and a ## heading
        const planContent =
          "## Feature Overview\nThis feature enables users to upload files through the drag-and-drop interface with validation and preview support.";
        await crossRuntime.runtime.fs.writeTextFile(
          `${tmpDir}/plan.md`,
          planContent,
        );

        const result = await compiler.detectActivePlan(tmpDir);
        assert.assertEquals(result !== null, true);
        assert.assertEquals(result!.quality, "ok");
      } finally {
        await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
      }
    },
  );

  bdd.it(
    "plan with ## heading but <100 non-WS chars → quality === 'sparse' (AND enforced)",
    async () => {
      const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
      try {
        // Has heading but very short — under 100 non-WS chars
        const planContent = "## Tasks\nDo stuff.";
        await crossRuntime.runtime.fs.writeTextFile(
          `${tmpDir}/plan.md`,
          planContent,
        );

        const result = await compiler.detectActivePlan(tmpDir);
        assert.assertEquals(result !== null, true);
        assert.assertEquals(result!.quality, "sparse");
      } finally {
        await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
      }
    },
  );

  bdd.it("file <60s old → ageLabel === 'just now'", async () => {
    const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
    try {
      const planContent =
        "## Fresh Plan\nThis was written seconds ago with enough content to be substantial.";
      await crossRuntime.runtime.fs.writeTextFile(
        `${tmpDir}/plan.md`,
        planContent,
      );

      const result = await compiler.detectActivePlan(tmpDir);
      assert.assertEquals(result !== null, true);
      assert.assertEquals(result!.ageLabel, "just now");
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });
});

// =============================================================================
// activePlanDetected in listen-first
// =============================================================================

bdd.describe("activePlanDetected in listen-first", () => {
  const inDiscoveryWithDesc = (): schema.StateFile =>
    machine.startSpec(idle(), "test-spec", "spec/test-spec", "Build a feature");

  bdd.it(
    "listen-first + detected plan → DiscoveryOutput has activePlanDetected",
    async () => {
      const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
      try {
        const planContent =
          "## My Plan\nThis contains enough content to qualify as an ok quality plan for testing purposes here.";
        await crossRuntime.runtime.fs.writeTextFile(
          `${tmpDir}/plan.md`,
          planContent,
        );

        const output = (await compiler.compile(
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
        )) as compiler.DiscoveryOutput;

        assert.assertEquals(output.activePlanDetected !== undefined, true);
        assert.assertEquals(
          output.activePlanDetected!.path,
          `${tmpDir}/plan.md`,
        );
        assert.assertEquals(typeof output.activePlanDetected!.age, "string");
        assert.assertEquals(
          typeof output.activePlanDetected!.preview,
          "string",
        );
        assert.assertEquals(
          output.activePlanDetected!.quality === "ok" ||
            output.activePlanDetected!.quality === "sparse",
          true,
        );
      } finally {
        await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
      }
    },
  );

  bdd.it(
    "detected sparse plan → listen-first instruction contains '⚠' warning",
    async () => {
      const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
      try {
        // Sparse: has heading but well under 100 non-WS chars
        await crossRuntime.runtime.fs.writeTextFile(
          `${tmpDir}/plan.md`,
          "## Tasks\nTodo.",
        );

        const output = (await compiler.compile(
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
        )) as compiler.DiscoveryOutput;

        assert.assertEquals(output.instruction.includes("⚠"), true);
      } finally {
        await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
      }
    },
  );

  bdd.it(
    "planPath !== null in state → DiscoveryOutput has planImported: true",
    async () => {
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

      const output = (await compiler.compile(
        stateWithPlan,
        noConcerns,
        noRules,
      )) as compiler.DiscoveryOutput;

      assert.assertEquals(
        (output as compiler.DiscoveryOutput).planImported,
        true,
      );
    },
  );
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

bdd.describe(
  "DISCOVERY_REFINEMENT Stage A — completeness + posture selection",
  () => {
    bdd.it(
      "behavioral.rules include completeness assessment instructions",
      async () => {
        const output = await compiler.compile(inStageA(), noConcerns, noRules);
        assert.assertEquals(
          output.behavioral.rules.some((r) =>
            r.includes("COMPLETENESS ASSESSMENT"),
          ),
          true,
        );
      },
    );

    bdd.it(
      "behavioral.rules include posture selection options a/b/c/d",
      async () => {
        const output = await compiler.compile(inStageA(), noConcerns, noRules);
        assert.assertEquals(
          output.behavioral.rules.some(
            (r) =>
              r.includes("Selective expansion") && r.includes("Hold scope"),
          ),
          true,
        );
      },
    );

    bdd.it("subPhase is 'stage-a' in DiscoveryReviewOutput", async () => {
      const output = (await compiler.compile(
        inStageA(),
        noConcerns,
        noRules,
      )) as compiler.DiscoveryReviewOutput;
      assert.assertEquals(output.subPhase, "stage-a");
    });

    bdd.it(
      "injects defaultReviewPosture message when manifest has default",
      async () => {
        const base = schema.createInitialManifest(
          [],
          ["claude-code"],
          ["anthropic"],
          {
            languages: [],
            frameworks: [],
            ci: [],
            testRunner: null,
          },
        );
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
        assert.assertEquals(
          output.behavioral.rules.some((r) =>
            r.includes("project default posture"),
          ),
          true,
        );
      },
    );

    bdd.it(
      "injects auto-posture suggestion when security-audited concern is active",
      async () => {
        const output = await compiler.compile(
          inStageA(),
          [securityAudited],
          noRules,
        );
        assert.assertEquals(
          output.behavioral.rules.some((r) => r.includes("suggested posture")),
          true,
        );
      },
    );

    bdd.it(
      "injects conflict warning when multiple concerns suggest different postures",
      async () => {
        // security-audited: selective-expansion, compliance: hold-scope → conflict
        const output = await compiler.compile(
          inStageA(),
          [securityAudited, compliance],
          noRules,
        );
        assert.assertEquals(
          output.behavioral.rules.some((r) => r.includes("different postures")),
          true,
        );
      },
    );
  },
);

bdd.describe("DISCOVERY_REFINEMENT Stage B — posture-guided review", () => {
  bdd.it(
    "selective-expansion posture injects selective-expansion rule",
    async () => {
      const state = machine.setReviewPosture(
        inDiscoveryReview(),
        "selective-expansion",
      );
      const output = await compiler.compile(state, noConcerns, noRules);
      assert.assertEquals(
        output.behavioral.rules.some((r) => r.includes("Selective expansion")),
        true,
      );
    },
  );

  bdd.it(
    "hold-scope posture injects hold-scope rule and abbreviated CEO review",
    async () => {
      const state = machine.setReviewPosture(inDiscoveryReview(), "hold-scope");
      const output = await compiler.compile(state, noConcerns, noRules);
      assert.assertEquals(
        output.behavioral.rules.some((r) => r.includes("Hold scope")),
        true,
      );
      // hold-scope = abbreviated — does NOT include the extended-only rules
      assert.assertEquals(
        output.behavioral.rules.some((r) =>
          r.includes("CEO REVIEW — REUSE SCORE"),
        ),
        false,
      );
      assert.assertEquals(
        output.behavioral.rules.some((r) =>
          r.includes("CEO REVIEW — FAILURE MODE REGISTRY"),
        ),
        false,
      );
    },
  );

  bdd.it("scope-expansion posture injects scope-expansion rule", async () => {
    const state = machine.setReviewPosture(
      inDiscoveryReview(),
      "scope-expansion",
    );
    const output = await compiler.compile(state, noConcerns, noRules);
    assert.assertEquals(
      output.behavioral.rules.some((r) => r.includes("Scope expansion")),
      true,
    );
  });

  bdd.it("scope-reduction posture injects scope-reduction rule", async () => {
    const state = machine.setReviewPosture(
      inDiscoveryReview(),
      "scope-reduction",
    );
    const output = await compiler.compile(state, noConcerns, noRules);
    assert.assertEquals(
      output.behavioral.rules.some((r) => r.includes("Scope reduction")),
      true,
    );
  });

  bdd.it(
    "re-assessment rule present when completenessScore is set",
    async () => {
      const state = machine.setCompletenessScore(
        machine.setReviewPosture(inDiscoveryReview(), "selective-expansion"),
        testScore,
      );
      const output = await compiler.compile(state, noConcerns, noRules);
      assert.assertEquals(
        output.behavioral.rules.some((r) => r.includes("RE-ASSESSMENT")),
        true,
      );
    },
  );
});

bdd.describe(
  "DISCOVERY_REFINEMENT Stage C — CEO review done, final decision",
  () => {
    bdd.it("behavioral.rules include stage-c decision prompt", async () => {
      const output = await compiler.compile(inStageC(), noConcerns, noRules);
      assert.assertEquals(
        output.behavioral.rules.some((r) =>
          r.includes("CEO review is complete"),
        ),
        true,
      );
    });

    bdd.it("subPhase is 'stage-c' when ceoReview is present", async () => {
      const output = (await compiler.compile(
        inStageC(),
        noConcerns,
        noRules,
      )) as compiler.DiscoveryReviewOutput;
      assert.assertEquals(output.subPhase, "stage-c");
    });

    bdd.it("stage-b tone is posture-guided", async () => {
      const stageB = machine.setReviewPosture(
        inDiscoveryReview(),
        "selective-expansion",
      );
      const output = await compiler.compile(stageB, noConcerns, noRules);
      assert.assertEquals(output.behavioral.tone.includes("posture"), true);
    });
  },
);

bdd.describe(
  "DiscoveryReviewOutput exp-5: completenessScore and reviewPosture",
  () => {
    bdd.it(
      "completenessScore and reviewPosture are populated from refinement sub-state",
      async () => {
        const state = machine.setCompletenessScore(
          machine.setReviewPosture(inDiscoveryReview(), "selective-expansion"),
          testScore,
        );
        const output = (await compiler.compile(
          state,
          noConcerns,
          noRules,
        )) as compiler.DiscoveryReviewOutput;
        assert.assertEquals(output.completenessScore?.overall, 7);
        assert.assertEquals(output.reviewPosture, "selective-expansion");
      },
    );
  },
);

// TASK-329: both revisit instructions said "revisited from EXECUTING", also
// after a revisit from BLOCKED.
bdd.describe("discovery after a revisit names the phase it came from", () => {
  const revisitedFromBlocked = (): schema.StateFile =>
    machine.revisitSpec(inBlocked(), "the API changed");

  bdd.it("with questions still open", async () => {
    const output = (await compiler.compile(
      revisitedFromBlocked(),
      noConcerns,
      noRules,
    )) as compiler.DiscoveryOutput;

    assert.assertStringIncludes(output.instruction, "revisited from BLOCKED");
  });

  bdd.it("with every question answered", async () => {
    let state = revisitedFromBlocked();
    for (const id of QUESTION_IDS) {
      state = machine.addDiscoveryAnswer(
        state,
        id,
        `A meaningful answer for ${id}`,
      );
    }

    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.DiscoveryOutput;

    assert.assertStringIncludes(output.instruction, "revisited from BLOCKED");
  });
});
