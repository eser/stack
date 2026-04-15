// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for `noskills next` answer handling:
 * - Agent batch discovery (all 6 answers in one JSON object)
 * - Refinement task parsing (split on task-N: prefix, not commas)
 * - Review-gate state machine (processStatusReport in EXECUTING/review-gate)
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as next from "./next.ts";
import * as machine from "../state/machine.ts";
import * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";

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

// =============================================================================
// Agent batch discovery
// =============================================================================

describe("Agent batch discovery", () => {
  it("batch JSON with all 6 keys transitions to DISCOVERY_REFINEMENT", async () => {
    const state = inDiscoveryAgent();
    const batchAnswer = JSON.stringify({
      status_quo: "Users manually upload files",
      ambition: "Add smart upload with validation",
      reversibility: "No irreversible changes",
      user_impact: "No breaking changes to existing workflows",
      verification: "Unit tests pass and coverage meets threshold",
      scope_boundary: "No admin panel changes in this iteration",
    });

    const result = await next.handleAnswer(
      "/tmp/test",
      state,
      config(),
      [],
      batchAnswer,
    );

    assertEquals(result.phase, "DISCOVERY_REFINEMENT");
    assertEquals(result.discovery.completed, true);
    assertEquals(result.discovery.answers.length, 6);

    // Verify all answers stored correctly
    const answerMap = new Map(
      result.discovery.answers.map((a) => [a.questionId, a.answer]),
    );
    assertEquals(answerMap.get("status_quo"), "Users manually upload files");
    assertEquals(answerMap.get("ambition"), "Add smart upload with validation");
    assertEquals(
      answerMap.get("scope_boundary"),
      "No admin panel changes in this iteration",
    );
  });

  it("partial JSON in agent mode falls through to single-answer mode", async () => {
    const state = inDiscoveryAgent();
    // Only 2 keys — not all 6 → treated as plain string answer for Q1
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

    assertEquals(result.phase, "DISCOVERY");
    assertEquals(result.discovery.answers.length, 1);
    assertEquals(result.discovery.answers[0]!.questionId, "status_quo");
    assertEquals(result.discovery.currentQuestion, 1);
  });

  it("plain string in agent mode stores for current question", async () => {
    const state = inDiscoveryAgent();

    const result = await next.handleAnswer(
      "/tmp/test",
      state,
      config(),
      [],
      "Users manually upload files",
    );

    assertEquals(result.phase, "DISCOVERY");
    assertEquals(result.discovery.answers.length, 1);
    assertEquals(result.discovery.answers[0]!.questionId, "status_quo");
    assertEquals(
      result.discovery.answers[0]!.answer,
      "Users manually upload files",
    );
    assertEquals(result.discovery.currentQuestion, 1);
  });

  it("human mode still accepts any JSON object as batch", async () => {
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

    assertEquals(result.phase, "DISCOVERY");
    assertEquals(result.discovery.answers.length, 2);
  });
});

// =============================================================================
// DISCOVERY_REFINEMENT split gating
// =============================================================================

describe("DISCOVERY_REFINEMENT split gating", () => {
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

  it("approve with multi-area stays in DISCOVERY_REFINEMENT", async () => {
    const state = multiAreaDiscoveryReview();

    const result = await next.handleAnswer(
      "/tmp/test",
      state,
      config(),
      [],
      "approve",
    );

    assertEquals(result.phase, "DISCOVERY_REFINEMENT");
    assertEquals(result.discovery.approved, true);
  });

  it("approve with single-area transitions to SPEC_PROPOSAL", async () => {
    const state = singleAreaDiscoveryReview();

    const result = await next.handleAnswer(
      "/tmp/test",
      state,
      config(),
      [],
      "approve",
    );

    assertEquals(result.phase, "SPEC_PROPOSAL");
  });

  it("keep records decision and transitions to SPEC_PROPOSAL", async () => {
    const state = machine.approveDiscoveryAnswers(multiAreaDiscoveryReview());

    const result = await next.handleAnswer(
      "/tmp/test",
      state,
      config(),
      [],
      "keep",
    );

    assertEquals(result.phase, "SPEC_PROPOSAL");
    assertEquals(result.decisions.length, 1);
    assertEquals(
      result.decisions[0]!.choice.includes("keep as single spec"),
      true,
    );
  });

  it("split creates child specs and cancels parent", async () => {
    const state = machine.approveDiscoveryAnswers(multiAreaDiscoveryReview());

    const result = await next.handleAnswer(
      "/tmp/test",
      state,
      config(),
      [],
      "split",
    );

    assertEquals(result.phase, "COMPLETED");
    assertEquals(result.completionReason, "cancelled");
    assertEquals(
      result.completionNote !== null &&
        result.completionNote.includes("Split into:"),
      true,
    );
  });
});

// =============================================================================
// parseRefinementTasks
// =============================================================================

describe("parseRefinementTasks", () => {
  it("splits newline-separated task-N: lines", () => {
    const text = "task-1: Add upload endpoint\ntask-2: Write tests";
    const tasks = next.parseRefinementTasks(text);

    assertEquals(tasks.length, 2);
    assertEquals(tasks[0], "task-1: Add upload endpoint");
    assertEquals(tasks[1], "task-2: Write tests");
  });

  it("preserves commas within task descriptions", () => {
    const text =
      "task-1: Add endpoint with validation, rate limiting\ntask-2: Write unit, integration tests";
    const tasks = next.parseRefinementTasks(text);

    assertEquals(tasks.length, 2);
    assertEquals(
      tasks[0],
      "task-1: Add endpoint with validation, rate limiting",
    );
    assertEquals(tasks[1], "task-2: Write unit, integration tests");
  });

  it("handles inline task-N: patterns (comma-separated)", () => {
    const text = "task-1: Add upload endpoint, task-2: Write tests";
    const tasks = next.parseRefinementTasks(text);

    assertEquals(tasks.length, 2);
    assertEquals(tasks[0], "task-1: Add upload endpoint");
    assertEquals(tasks[1], "task-2: Write tests");
  });

  it("preserves file extensions and special characters in descriptions", () => {
    const text =
      "task-1: Update README.md with new API docs\ntask-2: Fix config.ts imports";
    const tasks = next.parseRefinementTasks(text);

    assertEquals(tasks.length, 2);
    assertEquals(tasks[0], "task-1: Update README.md with new API docs");
    assertEquals(tasks[1], "task-2: Fix config.ts imports");
  });

  it("ignores preamble text before first task-N:", () => {
    const text =
      "Here are the revised tasks:\ntask-1: Add endpoint\ntask-2: Write tests";
    const tasks = next.parseRefinementTasks(text);

    assertEquals(tasks.length, 2);
    assertEquals(tasks[0], "task-1: Add endpoint");
    assertEquals(tasks[1], "task-2: Write tests");
  });
});

// =============================================================================
// consumeAskToken — edge cases for the discovery integrity token lifecycle
// =============================================================================

describe("consumeAskToken", () => {
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

  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_ask_token_",
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("returns STATED with exact match for valid token", async () => {
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

    assertEquals(result.source, "STATED");
    assertEquals(result.questionMatch, "exact");
  });

  it("returns STATED with modified match when token match=modified", async () => {
    await writeToken(tempDir, {
      token: "abc12345",
      stepId: "ambition",
      spec: "my-spec",
      match: "modified",
      createdAt: new Date().toISOString(),
      askedQuestion: "Tweaked question text",
    });

    const result = await next.consumeAskToken(tempDir, "my-spec", "ambition");

    assertEquals(result.source, "STATED");
    assertEquals(result.questionMatch, "modified");
  });

  it("returns INFERRED for wrong stepId", async () => {
    await writeToken(tempDir, {
      token: "abc12345",
      stepId: "status_quo",
      spec: "my-spec",
      match: "exact",
      createdAt: new Date().toISOString(),
    });

    const result = await next.consumeAskToken(tempDir, "my-spec", "ambition");

    assertEquals(result.source, "INFERRED");
    assertEquals(result.questionMatch, "not-asked");
  });

  it("returns INFERRED for wrong spec", async () => {
    await writeToken(tempDir, {
      token: "abc12345",
      stepId: "status_quo",
      spec: "spec-a",
      match: "exact",
      createdAt: new Date().toISOString(),
    });

    const result = await next.consumeAskToken(tempDir, "spec-b", "status_quo");

    assertEquals(result.source, "INFERRED");
    assertEquals(result.questionMatch, "not-asked");
  });

  it("returns INFERRED for expired token (> 30 min old)", async () => {
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

    assertEquals(result.source, "INFERRED");
    assertEquals(result.questionMatch, "not-asked");
  });

  it("returns INFERRED for missing token file", async () => {
    // No file written.
    const result = await next.consumeAskToken(
      tempDir,
      "my-spec",
      "status_quo",
    );

    assertEquals(result.source, "INFERRED");
    assertEquals(result.questionMatch, "not-asked");
  });

  it("is single-use — deletes file on successful consumption", async () => {
    await writeToken(tempDir, {
      token: "abc12345",
      stepId: "status_quo",
      spec: "my-spec",
      match: "exact",
      createdAt: new Date().toISOString(),
    });

    assertEquals(await tokenExists(tempDir), true);

    const result = await next.consumeAskToken(
      tempDir,
      "my-spec",
      "status_quo",
    );
    assertEquals(result.source, "STATED");

    // File should be gone now.
    assertEquals(await tokenExists(tempDir), false);

    // Second call must fall through to INFERRED.
    const second = await next.consumeAskToken(
      tempDir,
      "my-spec",
      "status_quo",
    );
    assertEquals(second.source, "INFERRED");
  });

  it("handles malformed JSON gracefully (returns INFERRED)", async () => {
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

    assertEquals(result.source, "INFERRED");
    assertEquals(result.questionMatch, "not-asked");
  });

  it("null spec in both token and expected is treated as match", async () => {
    await writeToken(tempDir, {
      token: "abc12345",
      stepId: "status_quo",
      spec: null,
      match: "exact",
      createdAt: new Date().toISOString(),
    });

    const result = await next.consumeAskToken(tempDir, null, "status_quo");

    assertEquals(result.source, "STATED");
    assertEquals(result.questionMatch, "exact");
  });
});

// =============================================================================
// Review-gate state machine
// =============================================================================

describe("Review-gate state machine", () => {
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

  it("cursor advances when all dimensions cleared (remaining:[])", async () => {
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

    assertEquals(result.execution.criteriaScope, "review-gate");
    assertEquals(result.execution.gateConcernCursor, 1);
    assertEquals(result.execution.awaitingStatusReport, true);
  });

  it("gate clears when last concern reviewed", async () => {
    const concern = minimalConcernWithDim();

    const result = await next.handleAnswer(
      "/tmp/test",
      inGate(0),
      config(),
      [concern],
      statusReport(["gate-test-concern-test-dim"]),
    );

    assertEquals(result.execution.criteriaScope, undefined);
    assertEquals(result.execution.gateConcernCursor, undefined);
    assertEquals(result.execution.awaitingStatusReport, false);
  });

  it("gate clears when cursor is at the last concern (boundary)", async () => {
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

    assertEquals(result.execution.criteriaScope, undefined);
    assertEquals(result.execution.gateConcernCursor, undefined);
    assertEquals(result.execution.awaitingStatusReport, false);
  });

  it("gate stays active when dimensions remain (backpressure)", async () => {
    const concern = minimalConcernWithDim();

    const result = await next.handleAnswer(
      "/tmp/test",
      inGate(0),
      config(),
      [concern],
      // Agent still has remaining items — gate must not advance
      statusReport([], ["gate-test-concern-test-dim"]),
    );

    assertEquals(result.execution.criteriaScope, "review-gate");
    assertEquals(result.execution.gateConcernCursor, 0);
    assertEquals(result.execution.awaitingStatusReport, true);
  });

  it("gate stays active when blocked items exist", async () => {
    const concern = minimalConcernWithDim();

    const result = await next.handleAnswer(
      "/tmp/test",
      inGate(0),
      config(),
      [concern],
      statusReport([], [], ["gate-test-concern-test-dim"]),
    );

    assertEquals(result.execution.criteriaScope, "review-gate");
    assertEquals(result.execution.awaitingStatusReport, true);
  });

  it("gate clears when no active concerns have review dimensions", async () => {
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

    assertEquals(result.execution.criteriaScope, undefined);
    assertEquals(result.execution.awaitingStatusReport, false);
  });

  it("non-JSON answer clears awaitingStatusReport regardless of gate scope", async () => {
    const concern = minimalConcernWithDim();

    const result = await next.handleAnswer(
      "/tmp/test",
      inGate(0),
      config(),
      [concern],
      "All dimensions verified — implementation is correct.",
    );

    // Non-JSON bypass: awaitingStatusReport cleared, gate exits
    assertEquals(result.execution.awaitingStatusReport, false);
  });

  it("R1 regression — normal task completion still works without gate", async () => {
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
    assertEquals(result.execution.criteriaScope, undefined);
    assertEquals(result.execution.awaitingStatusReport, false);
  });
});

// =============================================================================
// Living Spec: classification updated progressively during DISCOVERY
// =============================================================================

describe("Living Spec: progressive classification during DISCOVERY", () => {
  it("answering with UI keywords flips involvesWebUI from false to true", async () => {
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
    assertEquals(result.classification !== null, true);
    assertEquals(result.classification?.involvesWebUI, true);
    // Answer was recorded
    assertEquals(result.discovery.answers.length, 1);
    assertEquals(result.discovery.answers[0]?.questionId, "status_quo");
  });

  it("answering without special keywords leaves classification unchanged", async () => {
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
    assertEquals(result.classification?.involvesWebUI, false);
  });

  it("specState.path null short-circuits living-spec update but answer still recorded", async () => {
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
    assertEquals(result.discovery.answers.length, 1);
    assertEquals(result.discovery.answers[0]?.questionId, "status_quo");
    // classification may or may not be set depending on state — just verify no crash
  });
});

// =============================================================================
// import-plan answer handling
// =============================================================================

describe("import-plan answer handling", () => {
  const inListenFirst = (): schema.StateFile =>
    machine.startSpec(
      schema.createInitialState(),
      "test-spec",
      "spec/test-spec",
      "A feature with description",
    );

  it("answer 'import-plan' with plan present → state has userContext + planPath set", async () => {
    const tmpDir = await Deno.makeTempDir();
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

      assertEquals(
        (result.discovery.userContext?.length ?? 0) > 0,
        true,
      );
      assertEquals(result.discovery.planPath, `${tmpDir}/plan.md`);
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  it("answer 'import-plan' with no plan → warning context; 'import-plan' NOT stored; planPath null", async () => {
    const tmpDir = await Deno.makeTempDir();
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
      assertEquals(result.discovery.planPath, null);
      // userContext should contain a warning message, not the literal "import-plan"
      assertEquals(
        (result.discovery.userContext ?? []).some((c) => c === "import-plan"),
        false,
      );
      assertEquals(
        (result.discovery.userContext ?? []).some((c) =>
          c.includes("No active plan found")
        ),
        true,
      );
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  it("after import → next compile shows mode selection, not listen-first", async () => {
    const tmpDir = await Deno.makeTempDir();
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

      assertEquals(output.phase, "DISCOVERY");
      // Should NOT be listen-first (which has empty questions array and specific instruction)
      // Mode selection also has empty questions but has interactiveOptions for mode
      // The key: listen-first only fires when !hasPlan — after import hasPlan=true, so it's skipped
      assertEquals(
        (output as import("../context/compiler.ts").DiscoveryOutput)
          .planImported,
        true,
      );
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });

  it("after import → planImported: true in next compile output", async () => {
    const tmpDir = await Deno.makeTempDir();
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

      assertEquals(stateAfterImport.discovery.planPath !== null, true);

      // Re-compile and verify planImported flag
      const { compile } = await import("../context/compiler.ts");
      const output = await compile(stateAfterImport, [], []);

      assertEquals(
        (output as import("../context/compiler.ts").DiscoveryOutput)
          .planImported,
        true,
      );
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });
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

describe("DISCOVERY_REFINEMENT posture answer parsing", () => {
  it("shorthand 'a' sets selective-expansion posture", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "a",
    );
    assertEquals(
      result.discovery.refinement?.reviewPosture,
      "selective-expansion",
    );
  });

  it("shorthand 'b' sets hold-scope posture", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "b",
    );
    assertEquals(result.discovery.refinement?.reviewPosture, "hold-scope");
  });

  it("shorthand 'c' sets scope-expansion posture", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "c",
    );
    assertEquals(result.discovery.refinement?.reviewPosture, "scope-expansion");
  });

  it("shorthand 'd' sets scope-reduction posture", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "d",
    );
    assertEquals(result.discovery.refinement?.reviewPosture, "scope-reduction");
  });

  it("full posture string 'hold-scope' sets posture directly", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "hold-scope",
    );
    assertEquals(result.discovery.refinement?.reviewPosture, "hold-scope");
  });

  it("JSON {posture, completeness} sets both posture and scores", async () => {
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
    assertEquals(result.discovery.refinement?.reviewPosture, "hold-scope");
    assertEquals(
      result.discovery.refinement?.initialCompletenessScore?.overall,
      7,
    );
    assertEquals(result.discovery.refinement?.completenessScore?.overall, 7);
  });

  it("JSON {completeness} in stage-b updates completenessScore only (preserves initial)", async () => {
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
    assertEquals(
      result.discovery.refinement?.initialCompletenessScore?.overall,
      5,
    );
    assertEquals(result.discovery.refinement?.completenessScore?.overall, 9);
  });

  it("JSON {ceoReview, reflection} sets CEO review readiness", async () => {
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
    assertEquals(
      result.discovery.refinement?.ceoReview?.readinessScore?.overall,
      8,
    );
    assertEquals(
      result.discovery.refinement?.ceoReview?.reflection,
      "good spec overall",
    );
  });

  it("malformed JSON falls through without throwing", async () => {
    const result = await next.handleAnswer(
      "/tmp/test",
      inDiscoveryReview(),
      config(),
      [],
      "{not valid json{",
    );
    // State must still be a valid StateFile
    assertEquals(result.phase, "DISCOVERY_REFINEMENT");
  });

  it("'revise' in stage-c calls clearRefinement (returns to stage-a)", async () => {
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
    assertEquals(result.discovery.refinement, undefined);
    assertEquals(result.phase, "DISCOVERY_REFINEMENT");
  });

  it("'save-posture' writes defaultReviewPosture to manifest", async () => {
    const tmpDir = await Deno.makeTempDir();
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
      assertEquals(result.phase, "DISCOVERY_REFINEMENT");
      assertEquals(result.discovery.refinement?.reviewPosture, "hold-scope");

      // Manifest now has defaultReviewPosture
      const mf = await persistence.readManifest(tmpDir);
      assertEquals(mf?.defaultReviewPosture, "hold-scope");
    } finally {
      await crossRuntime.runtime.fs.remove(tmpDir, { recursive: true });
    }
  });
});
