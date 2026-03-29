// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for `noskills run` state machine logic.
 *
 * These test the decision logic of the run command — phase checks,
 * exit conditions — without spawning actual
 * claude processes.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as machine from "../state/machine.ts";
import * as schema from "../state/schema.ts";
import * as compiler from "../context/compiler.ts";

// =============================================================================
// Helpers
// =============================================================================

const idle = (): schema.StateFile => schema.createInitialState();

const inExecuting = (): schema.StateFile => {
  let s = idle();
  s = machine.startSpec(s, "test", "spec/test");
  s = machine.completeDiscovery(s);
  s = machine.approveDiscoveryReview(s);
  s = machine.approveSpec(s);
  s = machine.startExecution(s);
  return s;
};

const inSpecApproved = (): schema.StateFile => {
  let s = idle();
  s = machine.startSpec(s, "test", "spec/test");
  s = machine.completeDiscovery(s);
  s = machine.approveDiscoveryReview(s);
  s = machine.approveSpec(s);
  return s;
};

const inBlocked = (): schema.StateFile =>
  machine.blockExecution(inExecuting(), "need API key");

const inDone = (): schema.StateFile =>
  machine.transition(inExecuting(), "DONE");

const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];

// =============================================================================
// Phase validation
// =============================================================================

describe("noskills run: phase validation", () => {
  it("rejects IDLE phase", () => {
    const state = idle();
    assertEquals(
      state.phase !== "EXECUTING" && state.phase !== "SPEC_APPROVED",
      true,
    );
  });

  it("rejects DISCOVERY phase", () => {
    const state = machine.startSpec(idle(), "test", "spec/test");
    assertEquals(state.phase, "DISCOVERY");
    assertEquals(
      state.phase !== "EXECUTING" && state.phase !== "SPEC_APPROVED",
      true,
    );
  });

  it("accepts SPEC_APPROVED phase", () => {
    const state = inSpecApproved();
    assertEquals(state.phase, "SPEC_APPROVED");
  });

  it("accepts EXECUTING phase", () => {
    const state = inExecuting();
    assertEquals(state.phase, "EXECUTING");
  });
});

// =============================================================================
// SPEC_APPROVED → EXECUTING transition
// =============================================================================

describe("noskills run: SPEC_APPROVED transition", () => {
  it("transitions SPEC_APPROVED → EXECUTING via startExecution", () => {
    const state = inSpecApproved();
    const executing = machine.startExecution(state);
    assertEquals(executing.phase, "EXECUTING");
    assertEquals(executing.execution.iteration, 0);
  });
});

// =============================================================================
// Exit conditions
// =============================================================================

describe("noskills run: exit conditions", () => {
  it("exits on DONE (exit code 0 equivalent)", () => {
    const state = inDone();
    assertEquals(state.phase, "DONE");
  });

  it("exits on BLOCKED (exit code 1 equivalent)", () => {
    const state = inBlocked();
    assertEquals(state.phase, "BLOCKED");
  });

  it("max iterations triggers exit (exit code 2 equivalent)", () => {
    let state = inExecuting();
    // Simulate 50 iterations
    for (let i = 0; i < 50; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }
    assertEquals(state.execution.iteration >= 50, true);
  });
});

// =============================================================================
// Fresh process per iteration (no context carry-over)
// =============================================================================

describe("noskills run: fresh process per iteration", () => {
  it("each iteration reads fresh state from disk", () => {
    // Simulate: iteration 1 advances state
    let state = inExecuting();
    state = machine.advanceExecution(state, "iteration 1 done");
    assertEquals(state.execution.iteration, 1);

    // Simulate: "write to disk" then "read from disk" (next iteration)
    const serialized = JSON.stringify(state);
    const freshRead = JSON.parse(serialized) as schema.StateFile;

    assertEquals(freshRead.execution.iteration, 1);
    assertEquals(freshRead.execution.lastProgress, "iteration 1 done");
    assertEquals(freshRead.phase, "EXECUTING");

    // Compiler produces instruction based on fresh state
    const output = compiler.compile(freshRead, noConcerns, noRules);
    assertEquals(output.phase, "EXECUTING");
    assertEquals(output.meta.iteration, 1);
  });
});

// =============================================================================
// BLOCKED resolution in interactive mode
// =============================================================================

describe("noskills run: BLOCKED resolution", () => {
  it("unblock transitions BLOCKED → EXECUTING via machine.transition", () => {
    const blocked = inBlocked();
    assertEquals(blocked.phase, "BLOCKED");

    const unblocked = machine.transition(blocked, "EXECUTING");
    assertEquals(unblocked.phase, "EXECUTING");
  });

  it("resolution preserves iteration count", () => {
    let state = inExecuting();
    state = machine.advanceExecution(state, "step 1");
    state = machine.advanceExecution(state, "step 2");
    state = machine.blockExecution(state, "need decision");
    assertEquals(state.execution.iteration, 2);

    const unblocked = machine.transition(state, "EXECUTING");
    assertEquals(unblocked.execution.iteration, 2);
  });
});

// =============================================================================
// Prompt construction
// =============================================================================

describe("noskills run: prompt construction", () => {
  it("compiler output includes resumeHint for fresh agent", () => {
    const state = inExecuting();
    const output = compiler.compile(state, noConcerns, noRules);

    assertEquals(output.meta.resumeHint.length > 0, true);
    assertEquals(output.meta.resumeHint.includes("test"), true);
  });

  it("compiler output includes behavioral rules for agent", () => {
    const state = inExecuting();
    const output = compiler.compile(state, noConcerns, noRules);

    assertEquals(output.behavioral.rules.length > 0, true);
    assertEquals(output.behavioral.tone.includes("Start coding"), true);
  });

  it("compiler output includes concern reminders when active", () => {
    // Even without concerns loaded, the structure is present
    const state = inExecuting();
    const output = compiler.compile(state, noConcerns, noRules);
    const exec = output as compiler.ExecutionOutput;

    assertEquals(exec.context !== undefined, true);
    assertEquals(Array.isArray(exec.context.concernReminders), true);
  });
});

// =============================================================================
// autoCommit is CLI-side, not agent-side
// =============================================================================

describe("noskills run: git invariant", () => {
  it("autoCommit config is read from manifest, not from agent", () => {
    // The autoCommit field is checked as (config as Record)["autoCommit"]
    // This is a CLI-level check, not an agent instruction
    const config = schema.createInitialManifest([], [], [], {
      languages: [],
      frameworks: [],
      ci: [],
      testRunner: null,
    });

    // Default config has no autoCommit — CLI won't commit
    assertEquals(
      (config as Record<string, unknown>)["autoCommit"],
      undefined,
    );
  });

  it("behavioral rules tell agent git is read-only", () => {
    const state = inExecuting();
    const output = compiler.compile(state, noConcerns, noRules);

    const hasGitRule = output.behavioral.rules.some((r) =>
      r.includes("git write commands")
    );
    assertEquals(hasGitRule, true);
  });
});
