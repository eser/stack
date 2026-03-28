// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Decision lifecycle tests.
 * Covers: addDecision, one-time vs promoted, BLOCKED → resolve flow,
 * promote prompt (→ rule add), spec isolation, convention discovery behavioral rule.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";
import * as compiler from "../context/compiler.ts";
import * as template from "../spec/template.ts";
import { loadDefaultConcerns } from "../context/concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await loadDefaultConcerns();
const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];

const idle = (): schema.StateFile => schema.createInitialState();

const inExecuting = (): schema.StateFile => {
  let s = idle();
  s = machine.startSpec(s, "test-spec", "spec/test-spec");
  s = machine.completeDiscovery(s);
  s = machine.approveSpec(s);
  s = machine.startExecution(s);
  return s;
};

const inBlocked = (reason: string): schema.StateFile =>
  machine.blockExecution(inExecuting(), reason);

const makeDecision = (
  id: string,
  question: string,
  choice: string,
  promoted: boolean,
): schema.Decision => ({
  id,
  question,
  choice,
  promoted,
  timestamp: "2026-03-27T10:00:00Z",
});

// =============================================================================
// addDecision records in state
// =============================================================================

describe("Decision recording", () => {
  it("type=rule sets promoted=true", () => {
    const d = makeDecision("d1", "Validation library", "Zod", true);
    const state = machine.addDecision(inExecuting(), d);

    assertEquals(state.decisions.length, 1);
    assertEquals(state.decisions[0]?.promoted, true);
  });

  it("type=one-time sets promoted=false", () => {
    const d = makeDecision("d1", "Image API", "OpenAI Vision", false);
    const state = machine.addDecision(inExecuting(), d);

    assertEquals(state.decisions.length, 1);
    assertEquals(state.decisions[0]?.promoted, false);
  });
});

// =============================================================================
// BLOCKED → resolve records decision
// =============================================================================

describe("BLOCKED → resolve records decision", () => {
  it("resolution from BLOCKED adds decision to state", () => {
    const blocked = inBlocked("Which validation library?");
    assertEquals(blocked.phase, "BLOCKED");
    assertEquals(blocked.decisions.length, 0);

    // Simulate what next.ts BLOCKED handler does:
    const decision = makeDecision(
      `d${blocked.decisions.length + 1}`,
      "Which validation library?",
      "Use Zod",
      false,
    );
    let newState = machine.addDecision(blocked, decision);
    newState = machine.transition(newState, "EXECUTING");
    newState = {
      ...newState,
      execution: {
        ...newState.execution,
        lastProgress: "Resolved: Use Zod",
      },
    };

    assertEquals(newState.phase, "EXECUTING");
    assertEquals(newState.decisions.length, 1);
    assertEquals(newState.decisions[0]?.choice, "Use Zod");
    assertEquals(newState.decisions[0]?.promoted, false);
  });
});

// =============================================================================
// Promote prompt after block resolution
// =============================================================================

describe("Promote prompt after resolution", () => {
  it("shows promotePrompt when lastProgress starts with 'Resolved:'", () => {
    let state = inExecuting();
    const d = makeDecision("d1", "Which DB?", "PostgreSQL", false);
    state = machine.addDecision(state, d);
    state = {
      ...state,
      execution: {
        ...state.execution,
        lastProgress: "Resolved: PostgreSQL",
      },
    };

    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.promotePrompt !== undefined, true);
    assertEquals(output.promotePrompt!.choice, "PostgreSQL");
    assertEquals(
      output.promotePrompt!.prompt.includes("permanent rule"),
      true,
    );
    assertEquals(
      output.promotePrompt!.prompt.includes("rule add"),
      true,
    );
  });

  it("no promotePrompt when decision is already promoted", () => {
    let state = inExecuting();
    const d = makeDecision("d1", "Which DB?", "PostgreSQL", true);
    state = machine.addDecision(state, d);
    state = {
      ...state,
      execution: {
        ...state.execution,
        lastProgress: "Resolved: PostgreSQL",
      },
    };

    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    // No unpromoted decisions → no prompt
    assertEquals(output.promotePrompt, undefined);
  });

  it("no promotePrompt during normal execution (no resolution)", () => {
    const state = inExecuting();
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.promotePrompt, undefined);
  });
});

// =============================================================================
// Spec isolation — one-time decisions
// =============================================================================

describe("Decision isolation across specs", () => {
  it("one-time decisions stay in spec's decision list only", () => {
    let state = inExecuting();
    const d = makeDecision("d1", "API", "OpenAI", false);
    state = machine.addDecision(state, d);
    assertEquals(state.decisions.length, 1);

    // Reset → start new spec → decisions cleared
    state = machine.resetToIdle(state);
    assertEquals(state.decisions.length, 0);

    state = machine.startSpec(state, "new-spec", "spec/new-spec");
    assertEquals(state.decisions.length, 0);
  });

  it("promoted decisions persist as rules, not in state.decisions", () => {
    // When a decision is promoted, it gets written to .eser/rules/
    // The state.decisions array is per-spec (cleared on reset)
    // Rules persist via the sync engine, not via state
    let state = inExecuting();
    const d = makeDecision("d1", "Validation", "Zod", true);
    state = machine.addDecision(state, d);

    // Reset clears decisions
    state = machine.resetToIdle(state);
    assertEquals(state.decisions.length, 0);

    // But the rule file persists in .eser/rules/ (tested via sync integration)
    // The next spec will get it via context.rules, not state.decisions
  });
});

// =============================================================================
// Spec template includes decisions table
// =============================================================================

describe("Spec template decisions table", () => {
  it("includes decisions with promoted type", () => {
    const decisions = [
      makeDecision("d1", "Validation library", "Zod", true),
      makeDecision("d2", "Image API", "OpenAI Vision", false),
    ];

    const md = template.renderSpec("test", [], allConcerns, decisions);

    assertEquals(md.includes("## Decisions"), true);
    assertEquals(md.includes("Validation library"), true);
    assertEquals(md.includes("Zod"), true);
    assertEquals(md.includes("OpenAI Vision"), true);
    assertEquals(md.includes("| yes |"), true); // promoted
    assertEquals(md.includes("| no |"), true); // one-time
  });

  it("omits decisions section when no decisions", () => {
    const md = template.renderSpec("test", [], [], []);
    assertEquals(md.includes("## Decisions"), false);
  });
});

// =============================================================================
// Convention discovery in behavioral rules
// =============================================================================

describe("Convention discovery behavioral rule", () => {
  it("EXECUTING behavioral includes convention discovery instruction", () => {
    const state = inExecuting();
    const output = compiler.compile(state, noConcerns, noRules);

    const hasConventionRule = output.behavioral.rules.some((r) =>
      r.includes("permanent rule for this project")
    );
    assertEquals(hasConventionRule, true);
  });

  it("convention discovery mentions rule add command", () => {
    const state = inExecuting();
    const output = compiler.compile(state, noConcerns, noRules);

    const hasRuleAdd = output.behavioral.rules.some((r) =>
      r.includes("rule add")
    );
    assertEquals(hasRuleAdd, true);
  });

  it("convention discovery says never write to .eser/rules/ directly", () => {
    const state = inExecuting();
    const output = compiler.compile(state, noConcerns, noRules);

    const hasDirect = output.behavioral.rules.some((r) =>
      r.includes("Never write to")
    );
    assertEquals(hasDirect, true);
  });
});
