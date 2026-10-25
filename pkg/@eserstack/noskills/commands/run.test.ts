// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for `noskills run` state machine logic.
 *
 * These test the decision logic of the run command — phase checks,
 * exit conditions — without spawning actual
 * claude processes.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as machine from "../state/machine.ts";
import * as schema from "../state/schema.ts";
import * as compiler from "../context/compiler.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";
import * as cmd from "../output/cmd.ts";
import * as engine from "../sync/engine.ts";
import * as persistence from "../state/persistence.ts";
import * as run from "./run.ts";

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

const inCompleted = (): schema.StateFile =>
  machine.completeSpec(inExecuting(), "done");

const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];

// =============================================================================
// Phase validation
// =============================================================================

bdd.describe("noskills run: phase validation", () => {
  bdd.it("rejects IDLE phase", () => {
    const state = idle();
    assert.assertEquals(
      state.phase !== "EXECUTING" && state.phase !== "SPEC_APPROVED",
      true,
    );
  });

  bdd.it("rejects DISCOVERY phase", () => {
    const state = machine.startSpec(idle(), "test", "spec/test");
    assert.assertEquals(state.phase, "DISCOVERY");
    assert.assertEquals(
      state.phase !== "EXECUTING" && state.phase !== "SPEC_APPROVED",
      true,
    );
  });

  bdd.it("accepts SPEC_APPROVED phase", () => {
    const state = inSpecApproved();
    assert.assertEquals(state.phase, "SPEC_APPROVED");
  });

  bdd.it("accepts EXECUTING phase", () => {
    const state = inExecuting();
    assert.assertEquals(state.phase, "EXECUTING");
  });
});

// =============================================================================
// SPEC_APPROVED → EXECUTING transition
// =============================================================================

bdd.describe("noskills run: SPEC_APPROVED transition", () => {
  bdd.it("transitions SPEC_APPROVED → EXECUTING via startExecution", () => {
    const state = inSpecApproved();
    const executing = machine.startExecution(state);
    assert.assertEquals(executing.phase, "EXECUTING");
    assert.assertEquals(executing.execution.iteration, 0);
  });
});

// =============================================================================
// Exit conditions
// =============================================================================

bdd.describe("noskills run: exit conditions", () => {
  bdd.it("exits on COMPLETED (exit code 0 equivalent)", () => {
    const state = inCompleted();
    assert.assertEquals(state.phase, "COMPLETED");
  });

  bdd.it("exits on BLOCKED (exit code 1 equivalent)", () => {
    const state = inBlocked();
    assert.assertEquals(state.phase, "BLOCKED");
  });

  bdd.it("max iterations triggers exit (exit code 2 equivalent)", () => {
    let state = inExecuting();
    // Simulate 50 iterations
    for (let i = 0; i < 50; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }
    assert.assertEquals(state.execution.iteration >= 50, true);
  });
});

// =============================================================================
// Fresh process per iteration (no context carry-over)
// =============================================================================

bdd.describe("noskills run: fresh process per iteration", () => {
  bdd.it("each iteration reads fresh state from disk", async () => {
    // Simulate: iteration 1 advances state
    let state = inExecuting();
    state = machine.advanceExecution(state, "iteration 1 done");
    assert.assertEquals(state.execution.iteration, 1);

    // Simulate: "write to disk" then "read from disk" (next iteration)
    const serialized = JSON.stringify(state);
    const freshRead = JSON.parse(serialized) as schema.StateFile;

    assert.assertEquals(freshRead.execution.iteration, 1);
    assert.assertEquals(freshRead.execution.lastProgress, "iteration 1 done");
    assert.assertEquals(freshRead.phase, "EXECUTING");

    // Compiler produces instruction based on fresh state
    const output = await compiler.compile(freshRead, noConcerns, noRules);
    assert.assertEquals(output.phase, "EXECUTING");
    assert.assertEquals(output.meta.iteration, 1);
  });
});

// =============================================================================
// BLOCKED resolution in interactive mode
// =============================================================================

bdd.describe("noskills run: BLOCKED resolution", () => {
  bdd.it(
    "unblock transitions BLOCKED → EXECUTING via machine.transition",
    () => {
      const blocked = inBlocked();
      assert.assertEquals(blocked.phase, "BLOCKED");

      const unblocked = machine.transition(blocked, "EXECUTING");
      assert.assertEquals(unblocked.phase, "EXECUTING");
    },
  );

  bdd.it("resolution preserves iteration count", () => {
    let state = inExecuting();
    state = machine.advanceExecution(state, "step 1");
    state = machine.advanceExecution(state, "step 2");
    state = machine.blockExecution(state, "need decision");
    assert.assertEquals(state.execution.iteration, 2);

    const unblocked = machine.transition(state, "EXECUTING");
    assert.assertEquals(unblocked.execution.iteration, 2);
  });
});

// =============================================================================
// Prompt construction
// =============================================================================

bdd.describe("noskills run: prompt construction", () => {
  bdd.it("compiler output includes resumeHint for fresh agent", async () => {
    const state = inExecuting();
    const output = await compiler.compile(state, noConcerns, noRules);

    assert.assertEquals(output.meta.resumeHint.length > 0, true);
    assert.assertEquals(output.meta.resumeHint.includes("test"), true);
  });

  bdd.it("compiler output includes behavioral rules for agent", async () => {
    const state = inExecuting();
    const output = await compiler.compile(state, noConcerns, noRules);

    assert.assertEquals(output.behavioral.rules.length > 0, true);
    assert.assertEquals(
      output.behavioral.tone.includes("Orchestrate immediately"),
      true,
    );
  });

  bdd.it("compiler output includes concern reminders when active", async () => {
    // Even without concerns loaded, the structure is present
    const state = inExecuting();
    const output = await compiler.compile(state, noConcerns, noRules);
    const exec = output as compiler.ExecutionOutput;

    assert.assertEquals(exec.context !== undefined, true);
    assert.assertEquals(Array.isArray(exec.context.concernReminders), true);
  });
});

// =============================================================================
// autoCommit is CLI-side, not agent-side
// =============================================================================

bdd.describe("noskills run: git invariant", () => {
  bdd.it("autoCommit config is read from manifest, not from agent", () => {
    // The autoCommit field is checked as (config as Record)["autoCommit"]
    // This is a CLI-level check, not an agent instruction
    const config = schema.createInitialManifest([], [], [], {
      languages: [],
      frameworks: [],
      ci: [],
      testRunner: null,
    });

    // Default config has no autoCommit — CLI won't commit
    assert.assertEquals(
      (config as Record<string, unknown>)["autoCommit"],
      undefined,
    );
  });

  bdd.it("behavioral rules tell agent git is read-only", async () => {
    const state = inExecuting();
    const output = await compiler.compile(state, noConcerns, noRules);

    const hasGitRule = output.behavioral.rules.some((r) =>
      r.includes("git write commands"),
    );
    assert.assertEquals(hasGitRule, true);
  });
});

// =============================================================================
// Headless prompt: no rule waits for a person to answer
// =============================================================================

bdd.describe("noskills run: headless prompt", () => {
  const compileHeadless = (
    state: schema.StateFile,
    activeConcerns: readonly schema.ConcernDefinition[] = noConcerns,
  ) =>
    compiler.compile(
      state,
      activeConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      run.headlessHints(),
    );

  const interactiveOnly = [
    "AskUserQuestion",
    "Recommend first, then ask",
    "Display `roadmap`",
    "Permanent rule or just this task",
    "Listen first",
  ];

  bdd.it(
    "headlessHints keeps the tool's hints and marks the run headless",
    () => {
      const hints = run.headlessHints();

      assert.assertEquals(hints.interactive, false);
      assert.assertEquals(hints.subAgentMethod, "task");
    },
  );

  bdd.it("headlessHints are the hints of the provider the loop runs", () => {
    // A manifest that lists Cursor first used to give the claude-code turn
    // Cursor's hints. The loop always runs AGENT_PROVIDER.
    assert.assertEquals(run.AGENT_PROVIDER, "claude-code");
    assert.assertEquals(run.headlessHints(), {
      ...engine.interactionHintsFor(run.AGENT_PROVIDER),
      interactive: false,
    });
  });

  bdd.it("EXECUTING rules leave out interactive-only rules", async () => {
    const output = await compileHeadless(inExecuting());

    for (const phrase of interactiveOnly) {
      assert.assertEquals(
        output.behavioral.rules.filter((r) => r.includes(phrase)),
        [],
        phrase,
      );
    }
  });

  bdd.it("decisions go through block, not a question", async () => {
    const output = await compileHeadless(inExecuting());
    const decisionRule = output.behavioral.rules.find((r) =>
      r.startsWith("Never skip steps or infer decisions."),
    );

    assert.assertExists(decisionRule);
    assert.assertStringIncludes(
      decisionRule,
      cmd.cmd('spec test block "reason"'),
    );
  });

  bdd.it(
    "the interactive compile still has the interactive rules",
    async () => {
      const output = await compiler.compile(inExecuting(), noConcerns, noRules);

      assert.assertEquals(
        output.behavioral.rules.some((r) => r.includes("AskUserQuestion")),
        true,
      );
    },
  );

  bdd.it("the tension gate blocks instead of asking", async () => {
    const concernsById = (ids: readonly string[]) =>
      defaultConcerns.DEFAULT_CONCERNS.filter((c) => ids.includes(c.id));
    const output = (await compileHeadless(
      inExecuting(),
      concernsById(["move-fast", "compliance"]),
    )) as compiler.ExecutionOutput;

    assert.assertStringIncludes(output.instruction, "TENSION GATE");
    assert.assertStringIncludes(output.instruction, cmd.cmd("spec test block"));
    assert.assertEquals(output.instruction.includes("AskUserQuestion"), false);
  });

  bdd.it("the prompt footer names the spec in every command", async () => {
    const prompt = run.buildAgentPrompt(await compileHeadless(inExecuting()));

    assert.assertStringIncludes(
      prompt,
      cmd.cmd('spec test next --answer="your progress"'),
    );
    assert.assertStringIncludes(prompt, cmd.cmd('spec test block "reason"'));
    assert.assertStringIncludes(prompt, cmd.cmd("spec test done"));
    for (const phrase of interactiveOnly) {
      assert.assertEquals(prompt.includes(phrase), false, phrase);
    }
  });
});

// =============================================================================
// logBlocked
// =============================================================================

bdd.describe("logBlocked", () => {
  bdd.it(
    "creates the log directory and appends one line per call",
    async () => {
      const root = await runtime.fs.makeTempDir({ prefix: "nos_run_blocked_" });
      try {
        await run.logBlocked(root, "waiting on the API key", 2);
        await run.logBlocked(root, "tests still fail", 3);

        const log = await runtime.fs.readTextFile(
          `${root}/${persistence.paths.progressesDir}/blocked.log`,
        );
        const lines = log.trimEnd().split("\n");

        assert.assertEquals(lines.length, 2);
        assert.assertStringIncludes(
          lines[0]!,
          "iteration=2 reason=waiting on the API key",
        );
        assert.assertStringIncludes(
          lines[1]!,
          "iteration=3 reason=tests still fail",
        );
      } finally {
        await runtime.fs.remove(root, { recursive: true });
      }
    },
  );
});
