// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for `noskills next` answer handling:
 * - Agent batch discovery (all 6 answers in one JSON object)
 * - Refinement task parsing (split on task-N: prefix, not commas)
 * - Review-gate state machine (processStatusReport in EXECUTING/review-gate)
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as next from "./next.ts";
import * as machine from "../state/machine.ts";
import * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as split from "../state/split.ts";
import * as splitDetector from "../context/split-detector.ts";
import * as questions from "../context/questions.ts";

// =============================================================================
// Helpers
// =============================================================================

const config = (): schema.NosManifest =>
  schema.createInitialManifest([], ["claude-code"], ["anthropic"], {
    languages: ["typescript"],
    frameworks: [],
    ci: [],
    testRunner: "deno",
  });

const idle = (): schema.StateFile => schema.createInitialState();

const inDiscoveryAgent = (): schema.StateFile => {
  const s = machine.startSpec(idle(), "test-spec", "spec/test-spec");
  return { ...s, discovery: { ...s.discovery, audience: "agent" as const } };
};

const inDiscoveryHuman = (): schema.StateFile =>
  machine.startSpec(idle(), "test-spec", "spec/test-spec");

// Keys are the discovery question ids `next` takes, so they keep snake case.
const SIX_ANSWERS = {
  "status_quo": "Users manually upload files",
  ambition: "Add smart upload with validation",
  reversibility: "No irreversible changes",
  "user_impact": "No breaking changes to existing workflows",
  verification: "Unit tests pass and coverage meets threshold",
  "scope_boundary": "No admin panel changes in this iteration",
};

// =============================================================================
// Agent batch discovery
// =============================================================================

bdd.describe("Agent batch discovery", () => {
  bdd.it(
    "batch JSON with all 6 keys transitions to DISCOVERY_REFINEMENT",
    async () => {
      const state = inDiscoveryAgent();
      const batchAnswer = JSON.stringify(SIX_ANSWERS);

      const result = await next.handleAnswer(
        "/tmp/test",
        state,
        config(),
        [],
        batchAnswer,
      );

      assert.assertEquals(result.phase, "DISCOVERY_REFINEMENT");
      assert.assertEquals(result.discovery.completed, true);
      assert.assertEquals(result.discovery.answers.length, 6);

      // Verify all answers stored correctly
      const answerMap = new Map(
        result.discovery.answers.map((a) => [a.questionId, a.answer]),
      );
      assert.assertEquals(
        answerMap.get("status_quo"),
        "Users manually upload files",
      );
      assert.assertEquals(
        answerMap.get("ambition"),
        "Add smart upload with validation",
      );
      assert.assertEquals(
        answerMap.get("scope_boundary"),
        "No admin panel changes in this iteration",
      );
    },
  );

  bdd.it(
    "partial JSON in agent mode records the answers it holds",
    async () => {
      const state = inDiscoveryAgent();
      // Only 2 keys: the other four questions stay open for the next call.
      const partialAnswer = JSON.stringify({
        status_quo: "Users manually upload files today",
        ambition: "Add smart upload with validation",
      });

      const result = await next.handleAnswer(
        "/tmp/test",
        state,
        config(),
        [],
        partialAnswer,
      );

      assert.assertEquals(result.phase, "DISCOVERY");
      assert.assertEquals(
        result.discovery.answers.map((a) => a.questionId),
        ["status_quo", "ambition"],
      );
    },
  );

  bdd.it(
    "refuses a JSON answer keyed by an id that is not a question",
    async () => {
      await assert.assertRejects(
        () =>
          next.handleAnswer(
            "/tmp/test",
            inDiscoveryAgent(),
            config(),
            [],
            JSON.stringify({ statusquo: "Users manually upload files today" }),
          ),
        questions.DiscoveryAnswerError,
        '"statusquo"',
      );
    },
  );

  bdd.it(
    "plain text after a partial answer answers the first open question",
    async () => {
      let state = machine.addDiscoveryAnswer(
        inDiscoveryAgent(),
        "status_quo",
        "Users manually upload files today",
      );
      state = machine.addDiscoveryAnswer(
        state,
        "ambition",
        "Add smart upload with validation",
      );

      const result = await next.handleAnswer(
        "/tmp/test",
        state,
        config(),
        [],
        "Nothing irreversible; the old flow stays",
      );

      assert.assertEquals(
        result.discovery.answers.map((a) => a.questionId),
        ["status_quo", "ambition", "reversibility"],
      );
    },
  );

  bdd.it(
    "keeps discovery open while a follow-up is pending",
    async () => {
      const state = machine.addFollowUp(
        inDiscoveryAgent(),
        "reversibility",
        "What is the rollback plan?",
        "agent",
      );

      const result = await next.handleAnswer(
        "/tmp/test",
        state,
        config(),
        [],
        JSON.stringify(SIX_ANSWERS),
      );

      assert.assertEquals(result.phase, "DISCOVERY");
      assert.assertEquals(result.discovery.answers.length, 6);
      assert.assertEquals(machine.getPendingFollowUps(result).length, 1);
    },
  );

  bdd.it("plain string in agent mode stores for current question", async () => {
    const state = inDiscoveryAgent();

    const result = await next.handleAnswer(
      "/tmp/test",
      state,
      config(),
      [],
      "Users manually upload files",
    );

    assert.assertEquals(result.phase, "DISCOVERY");
    assert.assertEquals(result.discovery.answers.length, 1);
    assert.assertEquals(result.discovery.answers[0]!.questionId, "status_quo");
    assert.assertEquals(
      result.discovery.answers[0]!.answer,
      "Users manually upload files",
    );
    assert.assertEquals(result.discovery.currentQuestion, 1);
  });

  bdd.it("human mode still accepts any JSON object as batch", async () => {
    const state = inDiscoveryHuman();
    // Only 2 keys — human mode accepts any JSON object
    const partialAnswer = JSON.stringify({
      status_quo: "Users manually upload files today",
      ambition: "Add smart upload with validation",
    });

    const result = await next.handleAnswer(
      "/tmp/test",
      state,
      config(),
      [],
      partialAnswer,
    );

    assert.assertEquals(result.phase, "DISCOVERY");
    assert.assertEquals(result.discovery.answers.length, 2);
  });
});

// =============================================================================
// Provenance of answers submitted together
// =============================================================================

bdd.describe("Answers submitted together: provenance", () => {
  let root: string;

  const writeSteps = async (stepIds: readonly string[]): Promise<void> => {
    await crossRuntime.runtime.fs.mkdir(
      `${root}/${persistence.paths.progressesDir}`,
      { recursive: true },
    );
    await crossRuntime.runtime.fs.writeTextFile(
      `${root}/${persistence.paths.askTokenFile}`,
      JSON.stringify({
        token: "abc12345",
        spec: "test-spec",
        steps: stepIds.map((stepId) => ({ stepId, match: "exact" })),
        createdAt: new Date().toISOString(),
      }),
    );
  };

  const sourcesOf = (state: schema.StateFile): Record<string, unknown> =>
    Object.fromEntries(
      state.discovery.answers.map((a) => [
        a.questionId,
        schema.normalizeAnswer(a).source,
      ]),
    );

  bdd.beforeEach(async () => {
    root = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_batch_provenance_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  });

  bdd.it(
    "marks answers the user was asked STATED and does not flag them",
    async () => {
      await writeSteps(Object.keys(SIX_ANSWERS));

      const result = await next.handleAnswer(
        root,
        inDiscoveryAgent(),
        config(),
        [],
        JSON.stringify(SIX_ANSWERS),
      );

      assert.assertEquals(
        new Set(Object.values(sourcesOf(result))),
        new Set(["STATED"]),
      );
      assert.assertEquals(result.discovery.batchSubmitted, false);
    },
  );

  bdd.it(
    "flags the answers (Jidoka C1) when one was not asked",
    async () => {
      await writeSteps(Object.keys(SIX_ANSWERS).slice(0, 4));

      const result = await next.handleAnswer(
        root,
        inDiscoveryAgent(),
        config(),
        [],
        JSON.stringify(SIX_ANSWERS),
      );

      const sources = sourcesOf(result);
      assert.assertEquals(sources["user_impact"], "STATED");
      assert.assertEquals(sources["verification"], "INFERRED");
      assert.assertEquals(result.discovery.batchSubmitted, true);
    },
  );

  bdd.it("flags answers sent with no ask token at all", async () => {
    const result = await next.handleAnswer(
      root,
      inDiscoveryHuman(),
      config(),
      [],
      JSON.stringify(SIX_ANSWERS),
    );

    assert.assertEquals(result.discovery.batchSubmitted, true);
  });
});

// =============================================================================
// DISCOVERY_REFINEMENT split gating
// =============================================================================

bdd.describe("DISCOVERY_REFINEMENT split gating", () => {
  const multiAreaDiscoveryReview = (): schema.StateFile => {
    let state = inDiscoveryHuman();
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

  const singleAreaDiscoveryReview = (): schema.StateFile => {
    let state = inDiscoveryHuman();
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

  bdd.it("approve with multi-area stays in DISCOVERY_REFINEMENT", async () => {
    const state = multiAreaDiscoveryReview();

    const result = await next.handleAnswer(
      "/tmp/test",
      state,
      config(),
      [],
      "approve",
    );

    assert.assertEquals(result.phase, "DISCOVERY_REFINEMENT");
    assert.assertEquals(result.discovery.approved, true);
  });

  bdd.it("approve with single-area transitions to SPEC_PROPOSAL", async () => {
    const state = singleAreaDiscoveryReview();

    const result = await next.handleAnswer(
      "/tmp/test",
      state,
      config(),
      [],
      "approve",
    );

    assert.assertEquals(result.phase, "SPEC_PROPOSAL");
  });

  bdd.it("keep records decision and transitions to SPEC_PROPOSAL", async () => {
    const state = machine.approveDiscoveryAnswers(multiAreaDiscoveryReview());

    const result = await next.handleAnswer(
      "/tmp/test",
      state,
      config(),
      [],
      "keep",
    );

    assert.assertEquals(result.phase, "SPEC_PROPOSAL");
    assert.assertEquals(result.decisions.length, 1);
    assert.assertEquals(
      result.decisions[0]!.choice.includes("keep as single spec"),
      true,
    );
  });

  bdd.it("split creates child specs and cancels parent", async () => {
    // A fresh root per run: the split writes the child specs to disk and
    // refuses names that already exist.
    const root = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_next_split_",
    });
    try {
      const state = machine.approveDiscoveryAnswers(
        multiAreaDiscoveryReview(),
      );

      const result = await next.handleAnswer(
        root,
        state,
        config(),
        [],
        "split",
      );

      assert.assertEquals(result.phase, "COMPLETED");
      assert.assertEquals(result.completionReason, "cancelled");
      assert.assertNotEquals(result.completionNote, null);
      const childNames = result.completionNote!.replace("Split into: ", "")
        .split(", ");
      assert.assertEquals(childNames.length >= 2, true);
      const children = await Promise.all(
        childNames.map((name) => persistence.readSpecState(root, name)),
      );
      assert.assertEquals(
        children.map((child) => [child.spec, child.phase]),
        childNames.map((name) => [name, "DISCOVERY_REFINEMENT"]),
      );
    } finally {
      await crossRuntime.runtime.fs.remove(root, { recursive: true });
    }
  });

  bdd.it("split refuses a child name that is already a spec", async () => {
    const root = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_next_split_taken_",
    });
    try {
      const state = machine.approveDiscoveryAnswers(
        multiAreaDiscoveryReview(),
      );
      const [taken] = splitDetector.analyzeForSplit(state.discovery.answers)
        .proposals;
      if (taken === undefined) throw new Error("the fixture has no split");
      const existing = machine.startSpec(idle(), taken.name, "spec/existing");
      await crossRuntime.runtime.fs.mkdir(
        `${root}/${persistence.paths.specDir(taken.name)}`,
        { recursive: true },
      );
      await persistence.writeSpecState(root, taken.name, existing);

      const error = await assert.assertRejects(
        () => next.handleAnswer(root, state, config(), [], "split"),
        split.SplitRefusedError,
      );

      assert.assertEquals(error.names, [taken.name]);
      const kept = await persistence.readSpecState(root, taken.name);
      assert.assertEquals(kept.branch, "spec/existing");
      assert.assertEquals(kept.phase, "DISCOVERY");
    } finally {
      await crossRuntime.runtime.fs.remove(root, { recursive: true });
    }
  });
});

// =============================================================================
// parseRefinementTasks
// =============================================================================

bdd.describe("parseRefinementTasks", () => {
  bdd.it("splits newline-separated task-N: lines", () => {
    const text = "task-1: Add upload endpoint\ntask-2: Write tests";
    const tasks = next.parseRefinementTasks(text);

    assert.assertEquals(tasks.length, 2);
    assert.assertEquals(tasks[0], "task-1: Add upload endpoint");
    assert.assertEquals(tasks[1], "task-2: Write tests");
  });

  bdd.it("preserves commas within task descriptions", () => {
    const text =
      "task-1: Add endpoint with validation, rate limiting\ntask-2: Write unit, integration tests";
    const tasks = next.parseRefinementTasks(text);

    assert.assertEquals(tasks.length, 2);
    assert.assertEquals(
      tasks[0],
      "task-1: Add endpoint with validation, rate limiting",
    );
    assert.assertEquals(tasks[1], "task-2: Write unit, integration tests");
  });

  bdd.it("handles inline task-N: patterns (comma-separated)", () => {
    const text = "task-1: Add upload endpoint, task-2: Write tests";
    const tasks = next.parseRefinementTasks(text);

    assert.assertEquals(tasks.length, 2);
    assert.assertEquals(tasks[0], "task-1: Add upload endpoint");
    assert.assertEquals(tasks[1], "task-2: Write tests");
  });

  bdd.it(
    "preserves file extensions and special characters in descriptions",
    () => {
      const text =
        "task-1: Update README.md with new API docs\ntask-2: Fix config.ts imports";
      const tasks = next.parseRefinementTasks(text);

      assert.assertEquals(tasks.length, 2);
      assert.assertEquals(
        tasks[0],
        "task-1: Update README.md with new API docs",
      );
      assert.assertEquals(tasks[1], "task-2: Fix config.ts imports");
    },
  );

  bdd.it("ignores preamble text before first task-N:", () => {
    const text =
      "Here are the revised tasks:\ntask-1: Add endpoint\ntask-2: Write tests";
    const tasks = next.parseRefinementTasks(text);

    assert.assertEquals(tasks.length, 2);
    assert.assertEquals(tasks[0], "task-1: Add endpoint");
    assert.assertEquals(tasks[1], "task-2: Write tests");
  });
});

// =============================================================================
// consumeAskToken — edge cases for the discovery integrity token lifecycle
// =============================================================================

bdd.describe("consumeAskToken", () => {
  let tempDir: string;

  const writeToken = async (
    root: string,
    payload: Record<string, unknown>,
  ): Promise<void> => {
    const dir = `${root}/${persistence.paths.progressesDir}`;
    await crossRuntime.runtime.fs.mkdir(dir, { recursive: true });
    await crossRuntime.runtime.fs.writeTextFile(
      `${root}/${persistence.paths.askTokenFile}`,
      JSON.stringify(payload),
    );
  };

  const tokenExists = async (root: string): Promise<boolean> => {
    try {
      await crossRuntime.runtime.fs.readTextFile(
        `${root}/${persistence.paths.askTokenFile}`,
      );
      return true;
    } catch {
      return false;
    }
  };

  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_ask_token_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("returns STATED with exact match for valid token", async () => {
    await writeToken(tempDir, {
      token: "abc12345",
      stepId: "status_quo",
      spec: "my-spec",
      match: "exact",
      createdAt: new Date().toISOString(),
      askedQuestion: "What is the current behavior?",
    });

    const result = await next.consumeAskToken(
      tempDir,
      "my-spec",
      "status_quo",
    );

    assert.assertEquals(result.source, "STATED");
    assert.assertEquals(result.questionMatch, "exact");
  });

  bdd.it(
    "returns STATED with modified match when token match=modified",
    async () => {
      await writeToken(tempDir, {
        token: "abc12345",
        stepId: "ambition",
        spec: "my-spec",
        match: "modified",
        createdAt: new Date().toISOString(),
        askedQuestion: "Tweaked question text",
      });

      const result = await next.consumeAskToken(tempDir, "my-spec", "ambition");

      assert.assertEquals(result.source, "STATED");
      assert.assertEquals(result.questionMatch, "modified");
    },
  );

  bdd.it("returns INFERRED for wrong stepId", async () => {
    await writeToken(tempDir, {
      token: "abc12345",
      stepId: "status_quo",
      spec: "my-spec",
      match: "exact",
      createdAt: new Date().toISOString(),
    });

    const result = await next.consumeAskToken(tempDir, "my-spec", "ambition");

    assert.assertEquals(result.source, "INFERRED");
    assert.assertEquals(result.questionMatch, "not-asked");
  });

  bdd.it("returns INFERRED for wrong spec", async () => {
    await writeToken(tempDir, {
      token: "abc12345",
      stepId: "status_quo",
      spec: "spec-a",
      match: "exact",
      createdAt: new Date().toISOString(),
    });

    const result = await next.consumeAskToken(tempDir, "spec-b", "status_quo");

    assert.assertEquals(result.source, "INFERRED");
    assert.assertEquals(result.questionMatch, "not-asked");
  });

  bdd.it("returns INFERRED for expired token (> 30 min old)", async () => {
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    await writeToken(tempDir, {
      token: "abc12345",
      stepId: "status_quo",
      spec: "my-spec",
      match: "exact",
      createdAt: old,
    });

    const result = await next.consumeAskToken(
      tempDir,
      "my-spec",
      "status_quo",
    );

    assert.assertEquals(result.source, "INFERRED");
    assert.assertEquals(result.questionMatch, "not-asked");
  });

  bdd.it("returns INFERRED for missing token file", async () => {
    // No file written.
    const result = await next.consumeAskToken(
      tempDir,
      "my-spec",
      "status_quo",
    );

    assert.assertEquals(result.source, "INFERRED");
    assert.assertEquals(result.questionMatch, "not-asked");
  });

  bdd.it("is single-use — deletes file on successful consumption", async () => {
    await writeToken(tempDir, {
      token: "abc12345",
      stepId: "status_quo",
      spec: "my-spec",
      match: "exact",
      createdAt: new Date().toISOString(),
    });

    assert.assertEquals(await tokenExists(tempDir), true);

    const result = await next.consumeAskToken(
      tempDir,
      "my-spec",
      "status_quo",
    );
    assert.assertEquals(result.source, "STATED");

    // File should be gone now.
    assert.assertEquals(await tokenExists(tempDir), false);

    // Second call must fall through to INFERRED.
    const second = await next.consumeAskToken(
      tempDir,
      "my-spec",
      "status_quo",
    );
    assert.assertEquals(second.source, "INFERRED");
  });

  bdd.it("handles malformed JSON gracefully (returns INFERRED)", async () => {
    const dir = `${tempDir}/${persistence.paths.progressesDir}`;
    await crossRuntime.runtime.fs.mkdir(dir, { recursive: true });
    await crossRuntime.runtime.fs.writeTextFile(
      `${tempDir}/${persistence.paths.askTokenFile}`,
      "{ this is not valid json",
    );

    const result = await next.consumeAskToken(
      tempDir,
      "my-spec",
      "status_quo",
    );

    assert.assertEquals(result.source, "INFERRED");
    assert.assertEquals(result.questionMatch, "not-asked");
  });

  bdd.it(
    "null spec in both token and expected is treated as match",
    async () => {
      await writeToken(tempDir, {
        token: "abc12345",
        stepId: "status_quo",
        spec: null,
        match: "exact",
        createdAt: new Date().toISOString(),
      });

      const result = await next.consumeAskToken(tempDir, null, "status_quo");

      assert.assertEquals(result.source, "STATED");
      assert.assertEquals(result.questionMatch, "exact");
    },
  );
});

bdd.describe("consumeAskTokens", () => {
  let tempDir: string;

  const writeSteps = async (stepIds: readonly string[]): Promise<void> => {
    await crossRuntime.runtime.fs.mkdir(
      `${tempDir}/${persistence.paths.progressesDir}`,
      { recursive: true },
    );
    await crossRuntime.runtime.fs.writeTextFile(
      `${tempDir}/${persistence.paths.askTokenFile}`,
      JSON.stringify({
        token: "abc12345",
        spec: "my-spec",
        steps: stepIds.map((stepId, i) => ({
          stepId,
          match: i === 0 ? "exact" : "modified",
        })),
        createdAt: new Date().toISOString(),
      }),
    );
  };

  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_ask_tokens_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("takes every listed step the token holds", async () => {
    await writeSteps(["status_quo", "ambition", "reversibility"]);

    const taken = await next.consumeAskTokens(tempDir, "my-spec", [
      "status_quo",
      "ambition",
      "user_impact",
    ]);

    assert.assertEquals(taken.get("status_quo"), {
      source: "STATED",
      questionMatch: "exact",
    });
    assert.assertEquals(taken.get("ambition"), {
      source: "STATED",
      questionMatch: "modified",
    });
    assert.assertEquals(taken.has("user_impact"), false);
  });

  bdd.it("keeps the steps nobody took for a later answer", async () => {
    await writeSteps(["status_quo", "ambition"]);

    await next.consumeAskTokens(tempDir, "my-spec", ["status_quo"]);
    const later = await next.consumeAskToken(tempDir, "my-spec", "ambition");
    const again = await next.consumeAskToken(tempDir, "my-spec", "status_quo");

    assert.assertEquals(later.source, "STATED");
    assert.assertEquals(again.source, "INFERRED");
  });

  bdd.it("takes nothing from another spec's token", async () => {
    await writeSteps(["status_quo"]);

    const taken = await next.consumeAskTokens(tempDir, "other-spec", [
      "status_quo",
    ]);

    assert.assertEquals(taken.size, 0);
  });
});

// =============================================================================
// Review-gate state machine
// =============================================================================

bdd.describe("Review-gate state machine", () => {
  // Minimal concern with one review dimension — used as the test double
  const minimalConcernWithDim = (): schema.ConcernDefinition => ({
    id: "test-concern",
    name: "Test Concern",
    description: "Test",
    extras: [],
    specSections: [],
    reminders: [],
    acceptanceCriteria: [],
    reviewDimensions: [{
      id: "test-dim",
      label: "Test Dimension",
      prompt: "Check this thing exists in the implementation.",
      evidenceRequired: false,
      scope: "all" as const,
    }],
  });

  // Build a state that is already inside the review gate at the given cursor
  const inGate = (cursor = 0): schema.StateFile => ({
    ...schema.createInitialState(),
    phase: "EXECUTING" as const,
    spec: "test-spec",
    specState: {
      path: "spec/test-spec",
      status: "approved" as const,
      metadata: schema.EMPTY_SPEC_METADATA,
      placeholders: [],
    },
    execution: {
      ...schema.createInitialState().execution,
      awaitingStatusReport: true,
      criteriaScope: "review-gate" as const,
      gateConcernCursor: cursor,
      iteration: 1,
    },
  });

  // Encode a status-report JSON the way the agent submits it
  const statusReport = (
    completed: string[] = [],
    remaining: string[] = [],
    blocked: string[] = [],
  ): string => JSON.stringify({ completed, remaining, blocked });

  bdd.it(
    "cursor advances when all dimensions cleared (remaining:[])",
    async () => {
      const concern1 = minimalConcernWithDim();
      const concern2: schema.ConcernDefinition = {
        ...concern1,
        id: "second-concern",
        name: "Second Concern",
      };

      const result = await next.handleAnswer(
        "/tmp/test",
        inGate(0),
        config(),
        [concern1, concern2],
        // Agent clears cursor-0 concern; cursor-1 concern still pending
        statusReport(["gate-test-concern-test-dim"]),
      );

      assert.assertEquals(result.execution.criteriaScope, "review-gate");
      assert.assertEquals(result.execution.gateConcernCursor, 1);
      assert.assertEquals(result.execution.awaitingStatusReport, true);
    },
  );

  bdd.it("gate clears when last concern reviewed", async () => {
    const concern = minimalConcernWithDim();

    const result = await next.handleAnswer(
      "/tmp/test",
      inGate(0),
      config(),
      [concern],
      statusReport(["gate-test-concern-test-dim"]),
    );

    assert.assertEquals(result.execution.criteriaScope, undefined);
    assert.assertEquals(result.execution.gateConcernCursor, undefined);
    assert.assertEquals(result.execution.awaitingStatusReport, false);
  });

  bdd.it(
    "gate clears when cursor is at the last concern (boundary)",
    async () => {
      const concern1 = minimalConcernWithDim();
      const concern2: schema.ConcernDefinition = {
        ...concern1,
        id: "second-concern",
        name: "Second Concern",
      };

      // cursor=1 = the last concern in a 2-concern list
      const result = await next.handleAnswer(
        "/tmp/test",
        inGate(1),
        config(),
        [concern1, concern2],
        statusReport(["gate-second-concern-test-dim"]),
      );

      assert.assertEquals(result.execution.criteriaScope, undefined);
      assert.assertEquals(result.execution.gateConcernCursor, undefined);
      assert.assertEquals(result.execution.awaitingStatusReport, false);
    },
  );

  bdd.it(
    "gate stays active when dimensions remain (backpressure)",
    async () => {
      const concern = minimalConcernWithDim();

      const result = await next.handleAnswer(
        "/tmp/test",
        inGate(0),
        config(),
        [concern],
        // Agent still has remaining items — gate must not advance
        statusReport([], ["gate-test-concern-test-dim"]),
      );

      assert.assertEquals(result.execution.criteriaScope, "review-gate");
      assert.assertEquals(result.execution.gateConcernCursor, 0);
      assert.assertEquals(result.execution.awaitingStatusReport, true);
    },
  );

  bdd.it("gate stays active when blocked items exist", async () => {
    const concern = minimalConcernWithDim();

    const result = await next.handleAnswer(
      "/tmp/test",
      inGate(0),
      config(),
      [concern],
      statusReport([], [], ["gate-test-concern-test-dim"]),
    );

    assert.assertEquals(result.execution.criteriaScope, "review-gate");
    assert.assertEquals(result.execution.awaitingStatusReport, true);
  });

  bdd.it(
    "gate clears when no active concerns have review dimensions",
    async () => {
      const noDimsConcern: schema.ConcernDefinition = {
        id: "no-dims",
        name: "No Dims",
        description: "ACs only, no dimensions",
        extras: [],
        specSections: [],
        reminders: [],
        acceptanceCriteria: ["Something must be true"],
      };

      // remaining:[] → explicitlyComplete → concernsWithDims = [] → gate clears
      const result = await next.handleAnswer(
        "/tmp/test",
        inGate(0),
        config(),
        [noDimsConcern],
        statusReport(),
      );

      assert.assertEquals(result.execution.criteriaScope, undefined);
      assert.assertEquals(result.execution.awaitingStatusReport, false);
    },
  );

  bdd.it(
    "non-JSON answer clears awaitingStatusReport regardless of gate scope",
    async () => {
      const concern = minimalConcernWithDim();

      const result = await next.handleAnswer(
        "/tmp/test",
        inGate(0),
        config(),
        [concern],
        "All dimensions verified — implementation is correct.",
      );

      // Non-JSON bypass: awaitingStatusReport cleared, gate exits
      assert.assertEquals(result.execution.awaitingStatusReport, false);
    },
  );

  bdd.it(
    "R1 regression — normal task completion still works without gate",
    async () => {
      // Regression: the criteriaScope refactor must not break the existing
      // awaitingStatusReport path when criteriaScope is undefined.
      const normalExecutingState: schema.StateFile = {
        ...schema.createInitialState(),
        phase: "EXECUTING" as const,
        spec: "test-spec",
        specState: {
          path: "spec/test-spec",
          status: "approved" as const,
          metadata: schema.EMPTY_SPEC_METADATA,
          placeholders: [],
        },
        execution: {
          ...schema.createInitialState().execution,
          awaitingStatusReport: true,
          criteriaScope: undefined,
          iteration: 1,
        },
      };

      const result = await next.handleAnswer(
        "/tmp/test",
        normalExecutingState,
        config(),
        [],
        statusReport(),
      );

      // No criteriaScope = normal path: gate should NOT be entered
      assert.assertEquals(result.execution.criteriaScope, undefined);
      assert.assertEquals(result.execution.awaitingStatusReport, false);
    },
  );
});

// =============================================================================
// Living Spec: classification updated progressively during DISCOVERY
// =============================================================================

bdd.describe("Living Spec: progressive classification during DISCOVERY", () => {
  bdd.it(
    "answering with UI keywords flips involvesWebUI from false to true",
    async () => {
      // Start with DISCOVERY + a specState.path so applyLivingSpecToDiscoveryAnswer runs
      const base = machine.startSpec(
        schema.createInitialState(),
        "ui-spec",
        "spec/ui-spec",
      );
      const stateWithPath: schema.StateFile = {
        ...base,
        // Start with no classification (null)
        classification: null,
        specState: {
          path: "spec/ui-spec/spec.md", // non-null → triggers the living-spec update path
          status: "draft" as const,
          metadata: schema.EMPTY_SPEC_METADATA,
          placeholders: [
            {
              sectionId: "problem-statement",
              sectionTitle: "Problem Statement",
              status: "placeholder",
            },
          ],
        },
      };

      // An answer that contains UI-related keywords (inferClassification picks them up)
      const uiAnswer =
        "Users see a blank login page — we need a login form with email and password fields, a submit button, loading state, and error state for invalid credentials.";

      const result = await next.handleAnswer(
        "/tmp/test-living",
        stateWithPath,
        config(),
        [], // no concerns needed to trigger classification
        uiAnswer,
      );

      // Classification should now reflect UI involvement
      assert.assertEquals(result.classification !== null, true);
      assert.assertEquals(result.classification?.involvesWebUI, true);
      // Answer was recorded
      assert.assertEquals(result.discovery.answers.length, 1);
      assert.assertEquals(
        result.discovery.answers[0]?.questionId,
        "status_quo",
      );
    },
  );

  bdd.it(
    "answering without special keywords leaves classification unchanged",
    async () => {
      const base = machine.startSpec(
        schema.createInitialState(),
        "plain-spec",
        "spec/plain-spec",
      );
      const stateWithPath: schema.StateFile = {
        ...base,
        classification: {
          involvesWebUI: false,
          involvesCLI: false,
          involvesPublicAPI: false,
          involvesMigration: false,
          involvesDataHandling: false,
        },
        specState: {
          path: "spec/plain-spec/spec.md",
          status: "draft" as const,
          metadata: schema.EMPTY_SPEC_METADATA,
          placeholders: [],
        },
      };

      const plainAnswer =
        "Users run a CLI command that processes files in the current directory and outputs a summary.";

      const result = await next.handleAnswer(
        "/tmp/test-living",
        stateWithPath,
        config(),
        [],
        plainAnswer,
      );

      // involvesWebUI should still be false
      assert.assertEquals(result.classification?.involvesWebUI, false);
    },
  );

  bdd.it(
    "specState.path null short-circuits living-spec update but answer still recorded",
    async () => {
      // When path is null (spec created before living-spec feature), answer still goes through
      const base = machine.startSpec(
        schema.createInitialState(),
        "old-spec",
        "spec/old-spec",
      );
      // path stays null (createInitialState gives path: null in specState)

      const result = await next.handleAnswer(
        "/tmp/test-living",
        base,
        config(),
        [],
        "Users drag files into a drop zone on the main dashboard UI page with a drag-and-drop interface.",
      );

      // Answer recorded — living-spec skipped but this should not affect Q1 recording
      assert.assertEquals(result.discovery.answers.length, 1);
      assert.assertEquals(
        result.discovery.answers[0]?.questionId,
        "status_quo",
      );
      // classification may or may not be set depending on state — just verify no crash
    },
  );
});

// =============================================================================
// import-plan answer handling
// =============================================================================

bdd.describe("import-plan answer handling", () => {
  const inListenFirst = (): schema.StateFile =>
    machine.startSpec(
      schema.createInitialState(),
      "test-spec",
      "spec/test-spec",
      "A feature with description",
    );

  bdd.it(
    "answer 'import-plan' with plan present → state has userContext + planPath set",
    async () => {
      const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
      try {
        const planContent =
          "## Feature\nThis is my plan content with enough text to be meaningful.";
        await crossRuntime.runtime.fs.writeTextFile(
          `${tmpDir}/plan.md`,
          planContent,
        );

        const result = await next.handleAnswer(
          tmpDir,
          inListenFirst(),
          config(),
          [],
          "import-plan",
        );

        assert.assertEquals(
          (result.discovery.userContext?.length ?? 0) > 0,
          true,
        );
        assert.assertEquals(result.discovery.planPath, `${tmpDir}/plan.md`);
      } finally {
        await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
      }
    },
  );

  bdd.it(
    "answer 'import-plan' with no plan → warning context; 'import-plan' NOT stored; planPath null",
    async () => {
      const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
      try {
        // No plan.md in tmpDir

        const result = await next.handleAnswer(
          tmpDir,
          inListenFirst(),
          config(),
          [],
          "import-plan",
        );

        // planPath should remain null — no plan found
        assert.assertEquals(result.discovery.planPath, null);
        // userContext should contain a warning message, not the literal "import-plan"
        assert.assertEquals(
          (result.discovery.userContext ?? []).some((c) => c === "import-plan"),
          false,
        );
        assert.assertEquals(
          (result.discovery.userContext ?? []).some((c) =>
            c.includes("No active plan found")
          ),
          true,
        );
      } finally {
        await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
      }
    },
  );

  bdd.it(
    "after import → next compile shows mode selection, not listen-first",
    async () => {
      const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
      try {
        const planContent =
          "## Feature Plan\nBuild something useful for our users that solves a real problem they have.";
        await crossRuntime.runtime.fs.writeTextFile(
          `${tmpDir}/plan.md`,
          planContent,
        );

        // Simulate import-plan answer
        const stateAfterImport = await next.handleAnswer(
          tmpDir,
          inListenFirst(),
          config(),
          [],
          "import-plan",
        );

        // After import, planPath is set → hasPlan = true → listen-first is skipped
        // Mode is still undefined → should show mode selection step
        const { compile } = await import("../context/compiler.ts");
        const { loadDefaultConcerns } = await import("../context/concerns.ts");
        const concerns = await loadDefaultConcerns();
        const output = await compile(stateAfterImport, concerns, []);

        assert.assertEquals(output.phase, "DISCOVERY");
        // Should NOT be listen-first (which has empty questions array and specific instruction)
        // Mode selection also has empty questions but has interactiveOptions for mode
        // The key: listen-first only fires when !hasPlan — after import hasPlan=true, so it's skipped
        assert.assertEquals(
          (output as import("../context/compiler.ts").DiscoveryOutput)
            .planImported,
          true,
        );
      } finally {
        await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
      }
    },
  );

  bdd.it(
    "after import → planImported: true in next compile output",
    async () => {
      const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
      try {
        await crossRuntime.runtime.fs.writeTextFile(
          `${tmpDir}/plan.md`,
          "## My Feature\nLong enough content to pass detection with substantial text here for testing.",
        );

        const stateAfterImport = await next.handleAnswer(
          tmpDir,
          inListenFirst(),
          config(),
          [],
          "import-plan",
        );

        assert.assertEquals(stateAfterImport.discovery.planPath !== null, true);

        // Re-compile and verify planImported flag
        const { compile } = await import("../context/compiler.ts");
        const output = await compile(stateAfterImport, [], []);

        assert.assertEquals(
          (output as import("../context/compiler.ts").DiscoveryOutput)
            .planImported,
          true,
        );
      } finally {
        await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
      }
    },
  );
});

// =============================================================================
// DISCOVERY_REFINEMENT posture answer routing
// =============================================================================

const inDiscoveryReview = (): schema.StateFile =>
  machine.completeDiscovery(
    machine.startSpec(
      schema.createInitialState(),
      "test-spec",
      "spec/test-spec",
    ),
  );

bdd.describe("DISCOVERY_REFINEMENT posture answer parsing", () => {
  bdd.it("shorthand 'a' sets selective-expansion posture", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "a",
    );
    assert.assertEquals(
      result.discovery.refinement?.reviewPosture,
      "selective-expansion",
    );
  });

  bdd.it("shorthand 'b' sets hold-scope posture", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "b",
    );
    assert.assertEquals(
      result.discovery.refinement?.reviewPosture,
      "hold-scope",
    );
  });

  bdd.it("shorthand 'c' sets scope-expansion posture", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "c",
    );
    assert.assertEquals(
      result.discovery.refinement?.reviewPosture,
      "scope-expansion",
    );
  });

  bdd.it("shorthand 'd' sets scope-reduction posture", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "d",
    );
    assert.assertEquals(
      result.discovery.refinement?.reviewPosture,
      "scope-reduction",
    );
  });

  bdd.it("full posture string 'hold-scope' sets posture directly", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "hold-scope",
    );
    assert.assertEquals(
      result.discovery.refinement?.reviewPosture,
      "hold-scope",
    );
  });

  bdd.it(
    "JSON {posture, completeness} sets both posture and scores",
    async () => {
      const answer = JSON.stringify({
        posture: "hold-scope",
        completeness: {
          overall: 7,
          dimensions: [{ id: "problem-clarity", score: 7, notes: "clear" }],
          gaps: ["verification"],
          assessedAt: "2026-04-07T00:00:00.000Z",
        },
      });
      const result = await next.handleAnswer(
        "/tmp/test",
        inDiscoveryReview(),
        config(),
        [],
        answer,
      );
      assert.assertEquals(
        result.discovery.refinement?.reviewPosture,
        "hold-scope",
      );
      assert.assertEquals(
        result.discovery.refinement?.initialCompletenessScore?.overall,
        7,
      );
      assert.assertEquals(
        result.discovery.refinement?.completenessScore?.overall,
        7,
      );
    },
  );

  bdd.it(
    "JSON {completeness} in stage-b updates completenessScore only (preserves initial)",
    async () => {
      const originalScore: schema.CompletenessScore = {
        overall: 5,
        dimensions: [],
        gaps: ["initial gap"],
        assessedAt: "2026-04-07T00:00:00.000Z",
      };
      // stage-b: posture set, score already captured from stage-a
      const stageB = machine.setCompletenessScore(
        machine.setReviewPosture(inDiscoveryReview(), "selective-expansion"),
        originalScore,
      );

      const result = await next.handleAnswer(
        "/tmp/test",
        stageB,
        config(),
        [],
        JSON.stringify({
          completeness: {
            overall: 9,
            dimensions: [],
            gaps: [],
            assessedAt: "2026-04-07T01:00:00.000Z",
          },
        }),
      );
      // initial preserved, current updated
      assert.assertEquals(
        result.discovery.refinement?.initialCompletenessScore?.overall,
        5,
      );
      assert.assertEquals(
        result.discovery.refinement?.completenessScore?.overall,
        9,
      );
    },
  );

  bdd.it("JSON {ceoReview, reflection} sets CEO review readiness", async () => {
    const stageB = machine.setReviewPosture(
      inDiscoveryReview(),
      "selective-expansion",
    );
    const answer = JSON.stringify({
      ceoReview: {
        overall: 8,
        dimensions: [{ id: "premise-clarity", score: 8, notes: "solid" }],
        verdict: "approved",
      },
      reflection: "good spec overall",
    });
    const result = await next.handleAnswer(
      "/tmp/test",
      stageB,
      config(),
      [],
      answer,
    );
    assert.assertEquals(
      result.discovery.refinement?.ceoReview?.readinessScore?.overall,
      8,
    );
    assert.assertEquals(
      result.discovery.refinement?.ceoReview?.reflection,
      "good spec overall",
    );
  });

  bdd.it("malformed JSON falls through without throwing", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "{not valid json{",
    );
    // State must still be a valid StateFile
    assert.assertEquals(result.phase, "DISCOVERY_REFINEMENT");
  });

  bdd.it(
    "'revise' in stage-c calls clearRefinement (returns to stage-a)",
    async () => {
      const stageC = machine.setCeoReviewReadiness(
        machine.setReviewPosture(inDiscoveryReview(), "selective-expansion"),
        {
          overall: 8,
          dimensions: [],
          verdict: "approved",
        },
      );
      const result = await next.handleAnswer(
        "/tmp/test",
        stageC,
        config(),
        [],
        "revise",
      );
      assert.assertEquals(result.discovery.refinement, undefined);
      assert.assertEquals(result.phase, "DISCOVERY_REFINEMENT");
    },
  );

  bdd.it("'save-posture' writes defaultReviewPosture to manifest", async () => {
    const tmpDir = await crossRuntime.runtime.fs.makeTempDir();
    try {
      // Set up .eser directory and write an initial manifest
      await crossRuntime.runtime.fs.mkdir(`${tmpDir}/.eser`, {
        recursive: true,
      });
      await persistence.writeManifest(tmpDir, config());

      const stageB = machine.setReviewPosture(
        inDiscoveryReview(),
        "hold-scope",
      );

      const result = await next.handleAnswer(
        tmpDir,
        stageB,
        config(),
        [],
        "save-posture",
      );

      // State returned unchanged
      assert.assertEquals(result.phase, "DISCOVERY_REFINEMENT");
      assert.assertEquals(
        result.discovery.refinement?.reviewPosture,
        "hold-scope",
      );

      // Manifest now has defaultReviewPosture
      const mf = await persistence.readManifest(tmpDir);
      assert.assertEquals(mf?.defaultReviewPosture, "hold-scope");
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });
});

// =============================================================================
// runVerification
// =============================================================================

bdd.describe("runVerification", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_verify_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(root, { recursive: true });
  });

  bdd.it("passes with the command's stdout when it exits 0", async () => {
    const result = await next.runVerification(root, "echo checked; pwd");

    assert.assertEquals(result.passed, true);
    assert.assertStringIncludes(result.output, "checked\n");
    // Runs in the project root.
    assert.assertStringIncludes(
      result.output,
      await crossRuntime.runtime.fs.realPath(root),
    );
  });

  bdd.it("fails with stdout and stderr when it exits non-zero", async () => {
    const result = await next.runVerification(
      root,
      "echo out; echo broken >&2; exit 3",
    );

    assert.assertEquals(result.passed, false);
    assert.assertStringIncludes(result.output, "out");
    assert.assertStringIncludes(result.output, "broken");
  });

  bdd.it("says so when a failing command printed nothing", async () => {
    const result = await next.runVerification(root, "exit 1");

    assert.assertEquals(result.passed, false);
    assert.assertEquals(result.output, "Verification failed with no output");
  });

  bdd.it("stops a command that runs past the limit", async () => {
    const started = Date.now();
    const result = await next.runVerification(root, "exec sleep 30", 300);

    assert.assertEquals(result.passed, false);
    assert.assertStringIncludes(result.output, "did not finish within 0.3");
    assert.assertStringIncludes(result.output, "exec sleep 30");
    assert.assertLess(Date.now() - started, 10_000);
  });
});
