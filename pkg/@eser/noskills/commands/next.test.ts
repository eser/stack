// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for `noskills next` answer handling:
 * - Agent batch discovery (all 6 answers in one JSON object)
 * - Refinement task parsing (split on task-N: prefix, not commas)
 */

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as crossRuntime from "@eser/standards/cross-runtime";
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
