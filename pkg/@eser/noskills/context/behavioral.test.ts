// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Section 7: Behavioral Guardrails
 * Tests that behavioral rules are phase-correct and contain required constraints.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as compiler from "./compiler.ts";
import * as machine from "../state/machine.ts";
import * as schema from "../state/schema.ts";
import { loadDefaultConcerns } from "./concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await loadDefaultConcerns();
const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];
const openSource = allConcerns.find((c) => c.id === "open-source")!;

const idle = (): schema.StateFile => schema.createInitialState();

const inDiscovery = (): schema.StateFile =>
  machine.startSpec(idle(), "test-spec", "spec/test-spec");

const inExecuting = (): schema.StateFile => {
  const s = machine.startSpec(
    schema.createInitialState(),
    "test-spec",
    "spec/test-spec",
  );
  const sd = machine.completeDiscovery(s);
  const sdr = machine.approveDiscoveryReview(sd);
  const sa = machine.approveSpec(sdr);
  return machine.startExecution(sa);
};

const inBlocked = (): schema.StateFile =>
  machine.blockExecution(inExecuting(), "need decision");

const inCompleted = (): schema.StateFile =>
  machine.completeSpec(inExecuting(), "done");

const config15 = schema.createInitialManifest([], [], [], {
  languages: [],
  frameworks: [],
  ci: [],
  testRunner: null,
});

// =============================================================================
// 7.1 EXECUTING behavioral includes anti-exploration rules
// =============================================================================

describe("EXECUTING behavioral guardrails", () => {
  it("includes anti-exploration rule", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const hasAntiExplore = output.behavioral.rules.some((r) =>
      r.includes("Do not explore")
    );
    assertEquals(hasAntiExplore, true);
  });

  it("includes no-refactor rule", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const hasNoRefactor = output.behavioral.rules.some((r) =>
      r.includes("Do not refactor")
    );
    assertEquals(hasNoRefactor, true);
  });

  it("includes no-unasked-features rule", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("Do not add features")
    );
    assertEquals(has, true);
  });

  it("includes timebox exploration rule", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) => r.includes("timebox"));
    assertEquals(has, true);
  });
});

// =============================================================================
// 7.2 EXECUTING tone
// =============================================================================

describe("EXECUTING tone", () => {
  it("says 'Orchestrate immediately'", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    assertEquals(
      output.behavioral.tone.includes("Orchestrate immediately"),
      true,
    );
  });
});

// =============================================================================
// 7.3 DISCOVERY behavioral
// =============================================================================

describe("DISCOVERY behavioral", () => {
  it("tone is curious interviewer with a stake", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    assertEquals(output.behavioral.tone.includes("stake in the answers"), true);
  });

  it("tone says comes PREPARED", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    assertEquals(output.behavioral.tone.includes("PREPARED"), true);
  });

  it("has plan mode override", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    assertEquals(output.behavioral.modeOverride !== undefined, true);
    assertEquals(
      output.behavioral.modeOverride!.includes("plan mode"),
      true,
    );
  });

  it("blocks file writes", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("DO NOT create, edit, or write any files")
    );
    assertEquals(has, true);
  });

  it("says push back on vague answers", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("Push back on vague")
    );
    assertEquals(has, true);
  });

  it("includes pre-discovery codebase scan rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("pre-discovery codebase scan")
    );
    assertEquals(has, true);
  });

  it("includes premise challenge rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("challenge the user's initial spec description")
    );
    assertEquals(has, true);
  });

  it("includes options over open-ended rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("offer concrete options")
    );
    assertEquals(has, true);
  });

  it("includes dream state framing rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("CURRENT STATE") && r.includes("6-MONTH IDEAL")
    );
    assertEquals(has, true);
  });

  it("includes expansion proposals with scoring rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("expansion opportunities") && r.includes("completeness delta")
    );
    assertEquals(has, true);
  });

  it("includes architectural decision resolution rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("architectural decisions") && r.includes("RECOMMENDATION")
    );
    assertEquals(has, true);
  });

  it("includes error and rescue map rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("error and rescue paths") && r.includes("CRITICAL GAPS")
    );
    assertEquals(has, true);
  });

  it("includes post-discovery synthesis rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("DISCOVERY SUMMARY") && r.includes("confirmation")
    );
    assertEquals(has, true);
  });

  it("blocks state-modifying shell commands", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("DO NOT run shell commands that modify state")
    );
    assertEquals(has, true);
  });

  it("allows read-only commands", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("MAY read files") && r.includes("read-only commands")
    );
    assertEquals(has, true);
  });

  it("enforces one question at a time", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("one question at a time")
    );
    assertEquals(has, true);
  });

  it("includes follow-up on short answers", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("short answer") && r.includes("more specific")
    );
    assertEquals(has, true);
  });

  it("includes batch answer submission rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("submit them together") && r.includes("noskills next --answer")
    );
    assertEquals(has, true);
  });
});

// =============================================================================
// 7.4 BLOCKED behavioral
// =============================================================================

describe("BLOCKED behavioral", () => {
  it("says present decision as described", async () => {
    const output = await compiler.compile(inBlocked(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("exactly as described")
    );
    assertEquals(has, true);
  });

  it("says don't suggest preference unless asked", async () => {
    const output = await compiler.compile(inBlocked(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("Do not suggest")
    );
    assertEquals(has, true);
  });

  it("tone is Brief", async () => {
    const output = await compiler.compile(inBlocked(), noConcerns, noRules);
    assertEquals(output.behavioral.tone.includes("Brief"), true);
  });
});

// =============================================================================
// 7.5 Urgency threshold
// =============================================================================

describe("Urgency threshold", () => {
  it("iteration=14, threshold=15 → no urgency", async () => {
    let state = inExecuting();
    for (let i = 0; i < 14; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }
    const output = await compiler.compile(state, noConcerns, noRules, config15);
    assertEquals(output.behavioral.urgency, undefined);
  });

  it("iteration=15, threshold=15 → urgency present", async () => {
    let state = inExecuting();
    for (let i = 0; i < 15; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }
    const output = await compiler.compile(state, noConcerns, noRules, config15);
    assertEquals(output.behavioral.urgency !== undefined, true);
    assertEquals(output.behavioral.urgency!.includes("degrading"), true);
  });
});

// =============================================================================
// 7.6 Git read-only rule
// =============================================================================

describe("Git read-only rule", () => {
  it("EXECUTING includes git read-only in behavioral rules", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const hasGitRule = output.behavioral.rules.some((r) =>
      r.includes("git write commands")
    );
    assertEquals(hasGitRule, true);
  });

  it("DISCOVERY includes git read-only", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const hasGitRule = output.behavioral.rules.some((r) =>
      r.includes("git write commands")
    );
    assertEquals(hasGitRule, true);
  });

  it("git rule omitted when allowGit=true", async () => {
    const config = { ...config15, allowGit: true };
    const output = await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
      config,
    );
    const hasGitRule = output.behavioral.rules.some((r) =>
      r.includes("git write commands")
    );
    assertEquals(hasGitRule, false);
  });
});

// =============================================================================
// 7.7 No "commit" in behavioral instructions
// =============================================================================

describe("No commit in behavioral", () => {
  it("EXECUTING behavioral rules do not tell agent to commit", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);

    for (const rule of output.behavioral.rules) {
      // "commit" as an action verb (not inside "git commit" which is a block)
      const lower = rule.toLowerCase();
      const hasCommitAction = lower.includes("then commit") ||
        lower.includes("make a commit") ||
        lower.includes("create a commit");
      assertEquals(hasCommitAction, false);
    }
  });

  it("EXECUTING urgency does not say commit", async () => {
    let state = inExecuting();
    for (let i = 0; i < 16; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }
    const output = await compiler.compile(state, noConcerns, noRules, config15);

    if (output.behavioral.urgency) {
      const lower = output.behavioral.urgency.toLowerCase();
      assertEquals(lower.includes("then commit"), false);
      assertEquals(lower.includes("make a commit"), false);
    }
  });
});

// =============================================================================
// COMPLETED behavioral
// =============================================================================

describe("COMPLETED behavioral", () => {
  it("says report summary, do not start new work", async () => {
    const output = await compiler.compile(inCompleted(), noConcerns, noRules);
    const hasStop = output.behavioral.rules.some((r) =>
      r.includes("Do not start new work")
    );
    assertEquals(hasStop, true);
  });

  it("tone says Concise", async () => {
    const output = await compiler.compile(inCompleted(), noConcerns, noRules);
    assertEquals(output.behavioral.tone.includes("Concise"), true);
  });
});

// =============================================================================
// Behavioral with active concerns
// =============================================================================

describe("Behavioral with concerns active", () => {
  it("EXECUTING with open-source still includes all base rules", async () => {
    const output = await compiler.compile(
      inExecuting(),
      [openSource],
      noRules,
    );
    assertEquals(output.behavioral.rules.length >= 6, true);
    assertEquals(
      output.behavioral.rules.some((r) => r.includes("Do not explore")),
      true,
    );
  });

  it("concern reminders appear in context, not behavioral", async () => {
    const output = await compiler.compile(
      inExecuting(),
      [openSource],
      noRules,
    );
    const exec = output as compiler.ExecutionOutput;
    assertEquals(exec.context.concernReminders.length > 0, true);
    assertEquals(
      exec.context.concernReminders.some((r) => r.includes("open-source")),
      true,
    );
  });
});

// =============================================================================
// IDLE behavioral — AskUserQuestion format + concerns + user intent
// =============================================================================

describe("IDLE behavioral — AskUserQuestion, concerns, user intent", () => {
  it("tells agent to pass interactiveOptions DIRECTLY and use commandMap", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) => r.includes("commandMap"));
    assertEquals(has, true);
  });

  it("tells agent to use multiSelect for concerns", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("multiSelect:true")
    );
    assertEquals(has, true);
  });

  it("IDLE instruction says present ALL concerns", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);
    const idleOutput = output as compiler.IdleOutput;
    assertEquals(
      idleOutput.instruction.includes("ALL available concerns"),
      true,
    );
  });

  it("IDLE behavioral includes user intent rule", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("user has already told you what they want") ||
      r.includes("Do NOT re-ask")
    );
    assertEquals(has, true);
  });

  it("IDLE output phase is IDLE", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);
    assertEquals(output.phase, "IDLE");
  });
});

// =============================================================================
// DISCOVERY_REVIEW behavioral — split proposal rule
// =============================================================================

describe("DISCOVERY_REVIEW behavioral", () => {
  const inDiscoveryReview = (): schema.StateFile =>
    machine.completeDiscovery(inDiscovery());

  it("contains 'Do NOT split or merge specs on your own' rule", async () => {
    const output = await compiler.compile(
      inDiscoveryReview(),
      noConcerns,
      noRules,
    );
    const has = output.behavioral.rules.some((r) =>
      r.includes("Do NOT split or merge specs on your own")
    );
    assertEquals(has, true);
  });

  it("contains file-write block rule", async () => {
    const output = await compiler.compile(
      inDiscoveryReview(),
      noConcerns,
      noRules,
    );
    const has = output.behavioral.rules.some((r) =>
      r.includes("DO NOT create, edit, or write any files")
    );
    assertEquals(has, true);
  });

  it("tone says 'Careful reviewer'", async () => {
    const output = await compiler.compile(
      inDiscoveryReview(),
      noConcerns,
      noRules,
    );
    assertEquals(output.behavioral.tone.includes("Careful reviewer"), true);
  });
});

// =============================================================================
// EXECUTING behavioral — sub-agent (Issue 2) + fallback (E3)
// =============================================================================

describe("EXECUTING sub-agent behavioral rules", () => {
  it("includes sub-agent spawning rule", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("noskills-executor") || r.includes("sub-agent")
    );
    assertEquals(has, true);
  });

  it("includes sub-agent failure fallback rule", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("fall back to executing the task directly")
    );
    assertEquals(has, true);
  });
});
