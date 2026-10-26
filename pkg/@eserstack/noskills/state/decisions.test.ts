// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Decision lifecycle tests.
 * Covers: addDecision, one-time vs promoted, BLOCKED → resolve flow,
 * promote prompt (→ rule add), spec isolation, convention discovery behavioral rule.
 */

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";
import * as compiler from "../context/compiler.ts";
import * as template from "../spec/template.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = defaultConcerns.DEFAULT_CONCERNS;
const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];

const idle = (): schema.StateFile => schema.createInitialState();

const inExecuting = (): schema.StateFile => {
  let s = idle();
  s = machine.startSpec(s, "test-spec", "spec/test-spec");
  s = machine.completeDiscovery(s);
  s = machine.approveDiscoveryReview(s);
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

bdd.describe("Decision recording", () => {
  bdd.it("type=rule sets promoted=true", () => {
    const d = makeDecision("d1", "Validation library", "Zod", true);
    const state = machine.addDecision(inExecuting(), d);

    assert.assertEquals(state.decisions.length, 1);
    assert.assertEquals(state.decisions[0]?.promoted, true);
  });

  bdd.it("type=one-time sets promoted=false", () => {
    const d = makeDecision("d1", "Image API", "OpenAI Vision", false);
    const state = machine.addDecision(inExecuting(), d);

    assert.assertEquals(state.decisions.length, 1);
    assert.assertEquals(state.decisions[0]?.promoted, false);
  });
});

// =============================================================================
// BLOCKED → resolve records decision
// =============================================================================

bdd.describe("BLOCKED → resolve records decision", () => {
  bdd.it("resolution from BLOCKED adds decision to state", () => {
    const blocked = inBlocked("Which validation library?");
    assert.assertEquals(blocked.phase, "BLOCKED");
    assert.assertEquals(blocked.decisions.length, 0);

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

    assert.assertEquals(newState.phase, "EXECUTING");
    assert.assertEquals(newState.decisions.length, 1);
    assert.assertEquals(newState.decisions[0]?.choice, "Use Zod");
    assert.assertEquals(newState.decisions[0]?.promoted, false);
  });
});

// =============================================================================
// Promote prompt after block resolution
// =============================================================================

bdd.describe("Promote prompt after resolution", () => {
  bdd.it(
    "shows promotePrompt when lastProgress starts with 'Resolved:'",
    async () => {
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

      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
      )) as compiler.ExecutionOutput;

      assert.assertEquals(output.promotePrompt !== undefined, true);
      assert.assertEquals(output.promotePrompt!.choice, "PostgreSQL");
      assert.assertEquals(
        output.promotePrompt!.prompt.includes("permanent rule"),
        true,
      );
      assert.assertEquals(
        output.promotePrompt!.prompt.includes("rule add"),
        true,
      );
    },
  );

  bdd.it("no promotePrompt when decision is already promoted", async () => {
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

    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    // No unpromoted decisions → no prompt
    assert.assertEquals(output.promotePrompt, undefined);
  });

  bdd.it(
    "no promotePrompt during normal execution (no resolution)",
    async () => {
      const state = inExecuting();
      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
      )) as compiler.ExecutionOutput;

      assert.assertEquals(output.promotePrompt, undefined);
    },
  );
});

// =============================================================================
// Spec isolation — one-time decisions
// =============================================================================

bdd.describe("Decision isolation across specs", () => {
  bdd.it("one-time decisions stay in spec's decision list only", () => {
    let state = inExecuting();
    const d = makeDecision("d1", "API", "OpenAI", false);
    state = machine.addDecision(state, d);
    assert.assertEquals(state.decisions.length, 1);

    // Reset → start new spec → decisions cleared
    state = machine.resetToIdle(state);
    assert.assertEquals(state.decisions.length, 0);

    state = machine.startSpec(state, "new-spec", "spec/new-spec");
    assert.assertEquals(state.decisions.length, 0);
  });

  bdd.it("promoted decisions persist as rules, not in state.decisions", () => {
    // When a decision is promoted, it gets written to .eser/rules/
    // The state.decisions array is per-spec (cleared on reset)
    // Rules persist via the sync engine, not via state
    let state = inExecuting();
    const d = makeDecision("d1", "Validation", "Zod", true);
    state = machine.addDecision(state, d);

    // Reset clears decisions
    state = machine.resetToIdle(state);
    assert.assertEquals(state.decisions.length, 0);

    // But the rule file persists in .eser/rules/ (tested via sync integration)
    // The next spec will get it via context.rules, not state.decisions
  });
});

// =============================================================================
// Spec template includes decisions table
// =============================================================================

bdd.describe("Spec template decisions table", () => {
  bdd.it("includes decisions with promoted type", () => {
    const decisions = [
      makeDecision("d1", "Validation library", "Zod", true),
      makeDecision("d2", "Image API", "OpenAI Vision", false),
    ];

    const md = template.renderSpec("test", [], allConcerns, decisions);

    assert.assertEquals(md.includes("## Decisions"), true);
    assert.assertEquals(md.includes("Validation library"), true);
    assert.assertEquals(md.includes("Zod"), true);
    assert.assertEquals(md.includes("OpenAI Vision"), true);
    assert.assertEquals(md.includes("| yes |"), true); // promoted
    assert.assertEquals(md.includes("| no |"), true); // one-time
  });

  bdd.it("omits decisions section when no decisions", () => {
    const md = template.renderSpec("test", [], [], []);
    assert.assertEquals(md.includes("## Decisions"), false);
  });
});

// =============================================================================
// Convention discovery in behavioral rules
// =============================================================================

bdd.describe("Convention discovery behavioral rule", () => {
  bdd.it(
    "EXECUTING behavioral includes convention discovery instruction",
    async () => {
      const state = inExecuting();
      const output = await compiler.compile(state, noConcerns, noRules);

      const hasConventionRule = output.behavioral.rules.some(
        (r) =>
          r.includes("Permanent rule") ||
          r.includes("permanent rule") ||
          r.includes("rule add"),
      );
      assert.assertEquals(hasConventionRule, true);
    },
  );

  bdd.it("convention discovery mentions rule add command", async () => {
    const state = inExecuting();
    const output = await compiler.compile(state, noConcerns, noRules);

    const hasRuleAdd = output.behavioral.rules.some((r) =>
      r.includes("rule add"),
    );
    assert.assertEquals(hasRuleAdd, true);
  });

  bdd.it(
    "convention discovery says never write to .eser/rules/ directly",
    async () => {
      const state = inExecuting();
      const output = await compiler.compile(state, noConcerns, noRules);

      const hasDirect = output.behavioral.rules.some((r) =>
        r.includes("Never write to"),
      );
      assert.assertEquals(hasDirect, true);
    },
  );
});
