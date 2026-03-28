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
  const s = machine.startSpec(idle(), "test-spec", "spec/test-spec");
  const sd = machine.completeDiscovery(s);
  const sa = machine.approveSpec(sd);
  return machine.startExecution(sa);
};

const inBlocked = (): schema.StateFile =>
  machine.blockExecution(inExecuting(), "need decision");

const inDone = (): schema.StateFile =>
  machine.transition(inExecuting(), "DONE");

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
  it("includes anti-exploration rule", () => {
    const output = compiler.compile(inExecuting(), noConcerns, noRules);
    const hasAntiExplore = output.behavioral.rules.some((r) =>
      r.includes("Do not explore")
    );
    assertEquals(hasAntiExplore, true);
  });

  it("includes no-refactor rule", () => {
    const output = compiler.compile(inExecuting(), noConcerns, noRules);
    const hasNoRefactor = output.behavioral.rules.some((r) =>
      r.includes("Do not refactor")
    );
    assertEquals(hasNoRefactor, true);
  });

  it("includes no-unasked-features rule", () => {
    const output = compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("Do not add features")
    );
    assertEquals(has, true);
  });

  it("includes timebox exploration rule", () => {
    const output = compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) => r.includes("timebox"));
    assertEquals(has, true);
  });
});

// =============================================================================
// 7.2 EXECUTING tone
// =============================================================================

describe("EXECUTING tone", () => {
  it("says 'Start coding immediately'", () => {
    const output = compiler.compile(inExecuting(), noConcerns, noRules);
    assertEquals(output.behavioral.tone.includes("Start coding"), true);
  });
});

// =============================================================================
// 7.3 DISCOVERY behavioral
// =============================================================================

describe("DISCOVERY behavioral", () => {
  it("says agent is a messenger", () => {
    const output = compiler.compile(inDiscovery(), noConcerns, noRules);
    assertEquals(output.behavioral.tone.includes("messenger"), true);
  });

  it("says present questions one at a time", () => {
    const output = compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("ONE AT A TIME")
    );
    assertEquals(has, true);
  });

  it("says relay answer verbatim", () => {
    const output = compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) => r.includes("verbatim"));
    assertEquals(has, true);
  });

  it("says do not start coding", () => {
    const output = compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("Do not start coding")
    );
    assertEquals(has, true);
  });
});

// =============================================================================
// 7.4 BLOCKED behavioral
// =============================================================================

describe("BLOCKED behavioral", () => {
  it("says present decision as described", () => {
    const output = compiler.compile(inBlocked(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("exactly as described")
    );
    assertEquals(has, true);
  });

  it("says don't suggest preference unless asked", () => {
    const output = compiler.compile(inBlocked(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("Do not suggest")
    );
    assertEquals(has, true);
  });

  it("tone is Brief", () => {
    const output = compiler.compile(inBlocked(), noConcerns, noRules);
    assertEquals(output.behavioral.tone.includes("Brief"), true);
  });
});

// =============================================================================
// 7.5 Urgency threshold
// =============================================================================

describe("Urgency threshold", () => {
  it("iteration=14, threshold=15 → no urgency", () => {
    let state = inExecuting();
    for (let i = 0; i < 14; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }
    const output = compiler.compile(state, noConcerns, noRules, config15);
    assertEquals(output.behavioral.urgency, undefined);
  });

  it("iteration=15, threshold=15 → urgency present", () => {
    let state = inExecuting();
    for (let i = 0; i < 15; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }
    const output = compiler.compile(state, noConcerns, noRules, config15);
    assertEquals(output.behavioral.urgency !== undefined, true);
    assertEquals(output.behavioral.urgency!.includes("degrading"), true);
  });
});

// =============================================================================
// 7.6 Git read-only rule
// =============================================================================

describe("Git read-only rule", () => {
  it("EXECUTING includes git read-only in behavioral rules", () => {
    const output = compiler.compile(inExecuting(), noConcerns, noRules);
    const hasGitRule = output.behavioral.rules.some((r) =>
      r.includes("git write commands")
    );
    assertEquals(hasGitRule, true);
  });

  it("DISCOVERY includes git read-only", () => {
    const output = compiler.compile(inDiscovery(), noConcerns, noRules);
    const hasGitRule = output.behavioral.rules.some((r) =>
      r.includes("git write commands")
    );
    assertEquals(hasGitRule, true);
  });

  it("git rule omitted when allowGit=true", () => {
    const config = { ...config15, allowGit: true };
    const output = compiler.compile(inExecuting(), noConcerns, noRules, config);
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
  it("EXECUTING behavioral rules do not tell agent to commit", () => {
    const output = compiler.compile(inExecuting(), noConcerns, noRules);

    for (const rule of output.behavioral.rules) {
      // "commit" as an action verb (not inside "git commit" which is a block)
      const lower = rule.toLowerCase();
      const hasCommitAction = lower.includes("then commit") ||
        lower.includes("make a commit") ||
        lower.includes("create a commit");
      assertEquals(hasCommitAction, false);
    }
  });

  it("EXECUTING urgency does not say commit", () => {
    let state = inExecuting();
    for (let i = 0; i < 16; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }
    const output = compiler.compile(state, noConcerns, noRules, config15);

    if (output.behavioral.urgency) {
      const lower = output.behavioral.urgency.toLowerCase();
      assertEquals(lower.includes("then commit"), false);
      assertEquals(lower.includes("make a commit"), false);
    }
  });
});

// =============================================================================
// DONE behavioral
// =============================================================================

describe("DONE behavioral", () => {
  it("says report summary, do not start new work", () => {
    const output = compiler.compile(inDone(), noConcerns, noRules);
    const hasStop = output.behavioral.rules.some((r) =>
      r.includes("Do not start new work")
    );
    assertEquals(hasStop, true);
  });

  it("tone says Concise", () => {
    const output = compiler.compile(inDone(), noConcerns, noRules);
    assertEquals(output.behavioral.tone.includes("Concise"), true);
  });
});

// =============================================================================
// Behavioral with active concerns
// =============================================================================

describe("Behavioral with concerns active", () => {
  it("EXECUTING with open-source still includes all base rules", () => {
    const output = compiler.compile(
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

  it("concern reminders appear in context, not behavioral", () => {
    const output = compiler.compile(
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
