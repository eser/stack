// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Section 11: Ralph Loop Mechanics
 * Tests iteration tracking, resume hints, restart threshold, and progress persistence.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as compiler from "../context/compiler.ts";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";

// =============================================================================
// Helpers
// =============================================================================

const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];

const inExecuting = (): schema.StateFile => {
  let s = schema.createInitialState();
  s = machine.startSpec(s, "test-spec", "spec/test-spec");
  s = machine.completeDiscovery(s);
  s = machine.approveDiscoveryReview(s);
  s = machine.approveSpec(s);
  s = machine.startExecution(s);
  return s;
};

const configWith = (
  maxIter: number,
): schema.NosManifest => ({
  ...schema.createInitialManifest([], [], [], {
    languages: [],
    frameworks: [],
    ci: [],
    testRunner: null,
  }),
  maxIterationsBeforeRestart: maxIter,
});

// =============================================================================
// 11.2 Resume hint sufficient for cold start
// =============================================================================

describe("Resume hint for cold start", () => {
  it("contains spec name, iteration, and progress", async () => {
    let state = inExecuting();
    state = machine.advanceExecution(state, "task-2 in progress");
    state = machine.advanceExecution(state, "task-2 in progress");
    state = machine.advanceExecution(state, "task-2 in progress");
    state = machine.advanceExecution(state, "implemented auth module");

    const output = await compiler.compile(state, noConcerns, noRules);

    assertEquals(output.meta.resumeHint.includes("test-spec"), true);
    assertEquals(output.meta.resumeHint.includes("iteration 4"), true);
    assertEquals(
      output.meta.resumeHint.includes("implemented auth module"),
      true,
    );
  });

  it("fresh execution has start instruction in resume hint", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);

    assertEquals(output.meta.resumeHint.includes("test-spec"), true);
    assertEquals(output.meta.resumeHint.includes("Start the first task"), true);
  });
});

// =============================================================================
// 11.3 Iteration counter increments
// =============================================================================

describe("Iteration counter", () => {
  it("increments on each advanceExecution", () => {
    let state = inExecuting();

    state = machine.advanceExecution(state, "step 1");
    assertEquals(state.execution.iteration, 1);

    state = machine.advanceExecution(state, "step 2");
    assertEquals(state.execution.iteration, 2);

    state = machine.advanceExecution(state, "step 3");
    assertEquals(state.execution.iteration, 3);
  });

  it("starts at 0 after startExecution", () => {
    const state = inExecuting();
    assertEquals(state.execution.iteration, 0);
  });
});

// =============================================================================
// 11.4 Restart recommended at threshold
// =============================================================================

describe("Restart recommendation", () => {
  it("restartRecommended=true when iteration >= threshold", async () => {
    let state = inExecuting();
    for (let i = 0; i < 16; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }

    const output = await compiler.compile(
      state,
      noConcerns,
      noRules,
      configWith(15),
    ) as compiler.ExecutionOutput;

    assertEquals(output.restartRecommended, true);
    assertEquals(typeof output.restartInstruction, "string");
  });

  it("restartRecommended absent when iteration < threshold", async () => {
    let state = inExecuting();
    state = machine.advanceExecution(state, "step 1");

    const output = await compiler.compile(
      state,
      noConcerns,
      noRules,
      configWith(15),
    ) as compiler.ExecutionOutput;

    assertEquals(output.restartRecommended, undefined);
  });

  it("threshold=14, iteration=14 → restartRecommended", async () => {
    let state = inExecuting();
    for (let i = 0; i < 14; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }

    const config = {
      ...configWith(15),
      maxIterationsBeforeRestart: 14,
    };
    const output = await compiler.compile(
      state,
      noConcerns,
      noRules,
      config,
    ) as compiler.ExecutionOutput;

    assertEquals(output.restartRecommended, true);
  });
});

// =============================================================================
// 11.5 Progress persists across simulated session restarts
// =============================================================================

describe("Progress persistence", () => {
  it("state carries forward after simulated restart", async () => {
    // Simulate: agent worked 3 iterations, then "restart" (just read state again)
    let state = inExecuting();
    state = machine.advanceExecution(state, "task 1 done");
    state = machine.advanceExecution(state, "task 2 in progress");

    // Simulate fresh session: create new compiler output from persisted state
    const output = await compiler.compile(state, noConcerns, noRules);

    // The meta block carries forward everything
    assertEquals(output.meta.iteration, 2);
    assertEquals(output.meta.lastProgress, "task 2 in progress");
    assertEquals(output.meta.spec, "test-spec");
    assertEquals(output.meta.resumeHint.includes("iteration 2"), true);
  });
});

// =============================================================================
// 11.1 One task at a time (via instruction)
// =============================================================================

describe("One task at a time", () => {
  it("EXECUTING with parsed spec includes task inline", async () => {
    const mockSpec = {
      name: "test",
      tasks: [
        { id: "task-1", title: "Implement the feature" },
        { id: "task-2", title: "Write tests" },
      ],
      outOfScope: [],
      verification: [],
    };
    const output = await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
      undefined,
      mockSpec,
    ) as compiler.ExecutionOutput;

    assertEquals(output.task !== undefined, true);
    assertEquals(output.task!.id, "task-1");
    assertEquals(output.instruction.includes("task-1"), true);
  });

  it("EXECUTING without parsed spec says all tasks completed", async () => {
    const output = await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.instruction.includes("completed"), true);
  });
});

// =============================================================================
// Meta block completeness
// =============================================================================

describe("Meta block for every phase", () => {
  it("IDLE meta has correct fields", async () => {
    const output = await compiler.compile(
      schema.createInitialState(),
      noConcerns,
      noRules,
    );
    assertEquals(output.meta.spec, null);
    assertEquals(output.meta.iteration, 0);
    assertEquals(typeof output.meta.protocol, "string");
  });

  it("EXECUTING meta includes spec, branch, iteration", async () => {
    const state = inExecuting();
    const output = await compiler.compile(state, noConcerns, noRules);

    assertEquals(output.meta.spec, "test-spec");
    assertEquals(output.meta.spec, "test-spec");
    assertEquals(output.meta.branch, "spec/test-spec");
    assertEquals(output.meta.iteration, 0);
  });

  it("BLOCKED meta includes blocked reason", async () => {
    const state = machine.blockExecution(inExecuting(), "need decision");
    const output = await compiler.compile(state, noConcerns, noRules);

    assertEquals(output.meta.resumeHint.includes("blocked"), true);
  });

  it("COMPLETED meta includes completion summary", async () => {
    let state = inExecuting();
    state = machine.advanceExecution(state, "all done");
    state = machine.completeSpec(state, "done");
    const output = await compiler.compile(state, noConcerns, noRules);

    assertEquals(output.meta.resumeHint.includes("completed"), true);
    assertEquals(output.meta.iteration, 1);
  });
});
