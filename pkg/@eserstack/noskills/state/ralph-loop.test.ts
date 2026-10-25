// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Section 11: Ralph Loop Mechanics
 * Tests iteration tracking, resume hints, restart threshold, and progress persistence.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
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

const configWith = (maxIter: number): schema.NosManifest => ({
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

bdd.describe("Resume hint for cold start", () => {
  bdd.it("contains spec name, iteration, and progress", async () => {
    let state = inExecuting();
    state = machine.advanceExecution(state, "task-2 in progress");
    state = machine.advanceExecution(state, "task-2 in progress");
    state = machine.advanceExecution(state, "task-2 in progress");
    state = machine.advanceExecution(state, "implemented auth module");

    const output = await compiler.compile(state, noConcerns, noRules);

    assert.assertEquals(output.meta.resumeHint.includes("test-spec"), true);
    assert.assertEquals(output.meta.resumeHint.includes("iteration 4"), true);
    assert.assertEquals(
      output.meta.resumeHint.includes("implemented auth module"),
      true,
    );
  });

  bdd.it("fresh execution has start instruction in resume hint", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);

    assert.assertEquals(output.meta.resumeHint.includes("test-spec"), true);
    assert.assertEquals(
      output.meta.resumeHint.includes("Start the first task"),
      true,
    );
  });
});

// =============================================================================
// 11.3 Iteration counter increments
// =============================================================================

bdd.describe("Iteration counter", () => {
  bdd.it("increments on each advanceExecution", () => {
    let state = inExecuting();

    state = machine.advanceExecution(state, "step 1");
    assert.assertEquals(state.execution.iteration, 1);

    state = machine.advanceExecution(state, "step 2");
    assert.assertEquals(state.execution.iteration, 2);

    state = machine.advanceExecution(state, "step 3");
    assert.assertEquals(state.execution.iteration, 3);
  });

  bdd.it("starts at 0 after startExecution", () => {
    const state = inExecuting();
    assert.assertEquals(state.execution.iteration, 0);
  });
});

// =============================================================================
// 11.4 Restart recommended at threshold
// =============================================================================

bdd.describe("Restart recommendation", () => {
  bdd.it("restartRecommended=true when iteration >= threshold", async () => {
    let state = inExecuting();
    for (let i = 0; i < 16; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }

    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
      configWith(15),
    )) as compiler.ExecutionOutput;

    assert.assertEquals(output.restartRecommended, true);
    // A flag only: the agent gets no restart prose.
    assert.assertEquals("restartInstruction" in output, false);
  });

  bdd.it("restartRecommended absent when iteration < threshold", async () => {
    let state = inExecuting();
    state = machine.advanceExecution(state, "step 1");

    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
      configWith(15),
    )) as compiler.ExecutionOutput;

    assert.assertEquals(output.restartRecommended, undefined);
  });

  bdd.it("threshold=14, iteration=14 → restartRecommended", async () => {
    let state = inExecuting();
    for (let i = 0; i < 14; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }

    const config = {
      ...configWith(15),
      maxIterationsBeforeRestart: 14,
    };
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
      config,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(output.restartRecommended, true);
  });
});

// =============================================================================
// 11.5 Progress persists across simulated session restarts
// =============================================================================

bdd.describe("Progress persistence", () => {
  bdd.it("state carries forward after simulated restart", async () => {
    // Simulate: agent worked 3 iterations, then "restart" (just read state again)
    let state = inExecuting();
    state = machine.advanceExecution(state, "task 1 done");
    state = machine.advanceExecution(state, "task 2 in progress");

    // Simulate fresh session: create new compiler output from persisted state
    const output = await compiler.compile(state, noConcerns, noRules);

    // The meta block carries forward everything
    assert.assertEquals(output.meta.iteration, 2);
    assert.assertEquals(output.meta.lastProgress, "task 2 in progress");
    assert.assertEquals(output.meta.spec, "test-spec");
    assert.assertEquals(output.meta.resumeHint.includes("iteration 2"), true);
  });
});

// =============================================================================
// 11.1 One task at a time (via instruction)
// =============================================================================

bdd.describe("One task at a time", () => {
  bdd.it("EXECUTING with parsed spec includes task inline", async () => {
    const mockSpec = {
      name: "test",
      tasks: [
        { id: "task-1", title: "Implement the feature" },
        { id: "task-2", title: "Write tests" },
      ],
      outOfScope: [],
      verification: [],
    };
    const output = (await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
      undefined,
      mockSpec,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(output.task !== undefined, true);
    assert.assertEquals(output.task!.id, "task-1");
    assert.assertEquals(output.instruction.includes("task-1"), true);
  });

  bdd.it("EXECUTING without parsed spec says all tasks completed", async () => {
    const output = (await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(output.instruction.includes("completed"), true);
  });
});

// =============================================================================
// Meta block completeness
// =============================================================================

bdd.describe("Meta block for every phase", () => {
  bdd.it("IDLE meta has correct fields", async () => {
    const output = await compiler.compile(
      schema.createInitialState(),
      noConcerns,
      noRules,
    );
    assert.assertEquals(output.meta.spec, null);
    assert.assertEquals(output.meta.iteration, 0);
    assert.assertEquals(typeof output.meta.protocol, "string");
  });

  bdd.it("EXECUTING meta includes spec, branch, iteration", async () => {
    const state = inExecuting();
    const output = await compiler.compile(state, noConcerns, noRules);

    assert.assertEquals(output.meta.spec, "test-spec");
    assert.assertEquals(output.meta.spec, "test-spec");
    assert.assertEquals(output.meta.branch, "spec/test-spec");
    assert.assertEquals(output.meta.iteration, 0);
  });

  bdd.it("BLOCKED meta includes blocked reason", async () => {
    const state = machine.blockExecution(inExecuting(), "need decision");
    const output = await compiler.compile(state, noConcerns, noRules);

    assert.assertEquals(output.meta.resumeHint.includes("blocked"), true);
  });

  bdd.it("COMPLETED meta includes completion summary", async () => {
    let state = inExecuting();
    state = machine.advanceExecution(state, "all done");
    state = machine.completeSpec(state, "done");
    const output = await compiler.compile(state, noConcerns, noRules);

    assert.assertEquals(output.meta.resumeHint.includes("completed"), true);
    assert.assertEquals(output.meta.iteration, 1);
  });
});
