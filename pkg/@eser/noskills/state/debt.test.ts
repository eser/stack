// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Section 8: Iteration Debt Tracking
 * Tests status report requests, debt carry-forward, and verification backpressure.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as compiler from "../context/compiler.ts";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";
import { loadDefaultConcerns } from "../context/concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await loadDefaultConcerns();
const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];

const beautiful = allConcerns.find((c) => c.id === "beautiful-product")!;
const openSource = allConcerns.find((c) => c.id === "open-source")!;

const inExecuting = (): schema.StateFile => {
  let s = schema.createInitialState();
  s = machine.startSpec(s, "test-spec", "spec/test-spec");
  s = machine.completeDiscovery(s);
  // Provide classification so concern criteria are active in tests
  s = {
    ...s,
    classification: {
      involvesUI: true,
      involvesPublicAPI: true,
      involvesMigration: true,
      involvesDataHandling: true,
    },
  };
  s = machine.approveSpec(s);
  s = machine.startExecution(s);
  return s;
};

const withAwaitingReport = (state: schema.StateFile): schema.StateFile => ({
  ...state,
  execution: {
    ...state.execution,
    awaitingStatusReport: true,
  },
});

/** Helper: convert string descriptions to DebtItem[] for test data. */
const debtItems = (texts: string[], since = 1): schema.DebtItem[] =>
  texts.map((text, i) => ({ id: `debt-${i + 1}`, text, since }));

const withDebt = (
  state: schema.StateFile,
  items: schema.DebtItem[],
  fromIteration: number,
  unaddressedIterations: number = 1,
): schema.StateFile => ({
  ...state,
  execution: {
    ...state.execution,
    debt: { items, fromIteration, unaddressedIterations },
  },
});

const withVerifyFailed = (
  state: schema.StateFile,
  output: string,
): schema.StateFile => ({
  ...state,
  execution: {
    ...state.execution,
    lastVerification: {
      passed: false,
      output,
      timestamp: "2026-03-27T10:00:00Z",
    },
  },
});

const withVerifyPassed = (state: schema.StateFile): schema.StateFile => ({
  ...state,
  execution: {
    ...state.execution,
    lastVerification: {
      passed: true,
      output: "All tests passed",
      timestamp: "2026-03-27T10:00:00Z",
    },
  },
});

// =============================================================================
// 8.1 Task completion triggers status report request
// =============================================================================

describe("Status report request", () => {
  it("awaitingStatusReport=true triggers criteria in output", () => {
    const state = withAwaitingReport(inExecuting());
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.statusReportRequired, true);
    assertEquals(output.statusReport !== undefined, true);
    assertEquals(output.instruction.includes("acceptance criteria"), true);
  });

  it("awaitingStatusReport=false shows normal execution instruction", () => {
    const output = compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.statusReportRequired, undefined);
  });
});

// =============================================================================
// 8.3 Criteria includes concern-injected items
// =============================================================================

describe("Concern-injected criteria", () => {
  it("beautiful-product adds UI state criteria", () => {
    const state = withAwaitingReport(inExecuting());
    const output = compiler.compile(
      state,
      [beautiful],
      noRules,
    ) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const hasUIStates = criteria.some((c) =>
      c.text.includes("beautiful-product") && c.text.includes("UI states")
    );
    assertEquals(hasUIStates, true);
  });

  it("open-source adds documentation criteria", () => {
    const state = withAwaitingReport(inExecuting());
    const output = compiler.compile(
      state,
      [openSource],
      noRules,
    ) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const hasDocs = criteria.some((c) =>
      c.text.includes("open-source") && c.text.includes("documented")
    );
    assertEquals(hasDocs, true);
  });

  it("multiple concerns stack criteria", () => {
    const state = withAwaitingReport(inExecuting());
    const output = compiler.compile(
      state,
      [beautiful, openSource],
      noRules,
    ) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const beautifulCount =
      criteria.filter((c) => c.text.includes("beautiful-product")).length;
    const osCount =
      criteria.filter((c) => c.text.includes("open-source")).length;
    assertEquals(beautifulCount > 0, true);
    assertEquals(osCount > 0, true);
  });
});

// =============================================================================
// Folder rules in criteria
// =============================================================================

describe("Folder rules in acceptance criteria", () => {
  it("folder rules appear as (folder: path) prefixed criteria", () => {
    const state = withAwaitingReport(inExecuting());
    const folderRuleCriteria = [
      { folder: "pkg/@eser/noskills/sync", rule: "Sync must be idempotent" },
      {
        folder: "pkg/@eser/noskills/sync",
        rule: "All commands use dynamic prefix",
      },
    ];
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
      undefined,
      undefined,
      folderRuleCriteria,
    ) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const folderCriteria = criteria.filter((c) =>
      c.text.startsWith("(folder:")
    );
    assertEquals(folderCriteria.length, 2);
    assertEquals(
      folderCriteria[0]!.text.includes("Sync must be idempotent"),
      true,
    );
  });

  it("no folder rules when empty array passed", () => {
    const state = withAwaitingReport(inExecuting());
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
      undefined,
      undefined,
      [],
    ) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const folderCriteria = criteria.filter((c) =>
      c.text.startsWith("(folder:")
    );
    assertEquals(folderCriteria.length, 0);
  });

  it("folder rules stack with concern criteria", () => {
    const state = withAwaitingReport(inExecuting());
    const folderRuleCriteria = [
      { folder: "pkg/sync", rule: "Hook scripts must be self-contained" },
    ];
    const output = compiler.compile(
      state,
      [openSource],
      noRules,
      undefined,
      undefined,
      folderRuleCriteria,
    ) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const hasFolderRule = criteria.some((c) =>
      c.text.includes("self-contained")
    );
    const hasConcernRule = criteria.some((c) => c.text.includes("open-source"));
    assertEquals(hasFolderRule, true);
    assertEquals(hasConcernRule, true);
  });
});

// =============================================================================
// 8.4-8.7 Debt carry-forward
// =============================================================================

describe("Debt carry-forward", () => {
  it("8.4: debt items appear as previousIterationDebt in output", () => {
    const state = withDebt(
      inExecuting(),
      debtItems(["error UI", "API docs"], 3),
      3,
    );
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.previousIterationDebt !== undefined, true);
    assertEquals(output.previousIterationDebt!.items.length, 2);
    assertEquals(output.previousIterationDebt!.fromIteration, 3);
    assertEquals(
      output.previousIterationDebt!.note.includes("BEFORE"),
      true,
    );
  });

  it("8.5: debt persists when not cleared", () => {
    // Simulate: debt from iteration 3, now at iteration 5
    let state = withDebt(inExecuting(), debtItems(["error UI"], 3), 3);
    state = machine.advanceExecution(state, "step 4");
    state = machine.advanceExecution(state, "step 5");

    // Debt should still be there
    assertEquals(state.execution.debt !== null, true);
    assertEquals(state.execution.debt!.items.length, 1);
    assertEquals(state.execution.debt!.items[0]!.text, "error UI");
  });

  it("8.7: debt note says address BEFORE new work", () => {
    const state = withDebt(inExecuting(), debtItems(["stale item"]), 1);
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(
      output.previousIterationDebt!.note.includes("BEFORE starting new work"),
      true,
    );
  });
});

// =============================================================================
// 8.4 + 8.6: Debt in status report criteria
// =============================================================================

describe("Debt in status report criteria", () => {
  it("debt items appear with [DEBT] prefix in criteria", () => {
    const state = withAwaitingReport(
      withDebt(inExecuting(), debtItems(["error UI design"], 2), 2),
    );
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const debtCriteria = criteria.filter((c) => c.text.includes("[DEBT"));
    assertEquals(debtCriteria.length, 1);
    assertEquals(debtCriteria[0]!.text.includes("error UI design"), true);
  });
});

// =============================================================================
// 8.8-8.10 Verification backpressure
// =============================================================================

describe("Verification backpressure", () => {
  it("8.8: failed verification shows in criteria with FAILED prefix", () => {
    const state = withAwaitingReport(
      withVerifyFailed(inExecuting(), "FAIL: test_upload expected 200 got 500"),
    );
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.verificationFailed, true);
    const criteria = output.statusReport?.criteria ?? [];
    const failedCriteria = criteria.filter((c) => c.text.includes("[FAILED]"));
    assertEquals(failedCriteria.length, 1);
  });

  it("8.9: verification failure instruction says fix tests", () => {
    const state = withVerifyFailed(
      inExecuting(),
      "2 tests failed",
    );
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.instruction.includes("FAILED"), true);
    assertEquals(output.verificationFailed, true);
  });

  it("8.10: verification success shows normal instruction", () => {
    const state = withVerifyPassed(inExecuting());
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.verificationFailed, undefined);
    assertEquals(output.instruction.includes("FAILED"), false);
  });
});

// =============================================================================
// Verification gates status report
// =============================================================================

describe("Verification gates status report", () => {
  it("verify fails → awaitingStatusReport stays false (no status report)", () => {
    // Simulate: agent says "done", verification fails
    const state = {
      ...inExecuting(),
      execution: {
        ...inExecuting().execution,
        lastProgress: "task-1 done",
        lastVerification: {
          passed: false,
          output: "FAIL: 2 tests failed",
          timestamp: "2026-03-27T10:00:00Z",
        },
        awaitingStatusReport: false,
      },
    };

    // Compiler should show failure, NOT status report
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.verificationFailed, true);
    assertEquals(output.statusReportRequired, undefined);
    assertEquals(output.instruction.includes("FAILED"), true);
  });

  it("verify passes → awaitingStatusReport triggers status report", () => {
    const state = withAwaitingReport(withVerifyPassed(inExecuting()));
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.statusReportRequired, true);
    assertEquals(output.verificationFailed, undefined);
  });

  it("no verify configured → status report asked directly", () => {
    const state = withAwaitingReport(inExecuting());
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.statusReportRequired, true);
  });
});

// =============================================================================
// Debt urgency escalation
// =============================================================================

describe("Debt urgency escalation", () => {
  it("unaddressedIterations < 3 → normal note", () => {
    const state = withDebt(inExecuting(), debtItems(["error UI"]), 1, 2);
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(
      output.previousIterationDebt!.note.includes("BEFORE starting new work"),
      true,
    );
    assertEquals(
      output.previousIterationDebt!.note.includes("URGENT"),
      false,
    );
  });

  it("unaddressedIterations >= 3 → URGENT note", () => {
    const state = withDebt(inExecuting(), debtItems(["error UI"]), 1, 3);
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(
      output.previousIterationDebt!.note.includes("URGENT"),
      true,
    );
    assertEquals(
      output.previousIterationDebt!.note.includes("3 iterations"),
      true,
    );
  });

  it("unaddressedIterations = 5 → shows correct count", () => {
    const state = withDebt(inExecuting(), debtItems(["stale item"]), 1, 5);
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(
      output.previousIterationDebt!.note.includes("5 iterations"),
      true,
    );
  });
});

// =============================================================================
// Empty remaining → no debt
// =============================================================================

describe("Empty remaining clears debt", () => {
  it("remaining=[] and no old debt → no previousIterationDebt in output", () => {
    const state = inExecuting();
    const output = compiler.compile(
      state,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.previousIterationDebt, undefined);
  });
});

// =============================================================================
// Debt survives state reload (simulated)
// =============================================================================

describe("Debt persists across session restart", () => {
  it("debt in state survives simulated reload", () => {
    // Create state with debt, serialize and deserialize (simulating file persistence)
    const state = withDebt(inExecuting(), debtItems(["API docs"], 2), 2, 2);
    const serialized = JSON.stringify(state);
    const reloaded = JSON.parse(serialized) as schema.StateFile;

    assertEquals(reloaded.execution.debt !== null, true);
    assertEquals(reloaded.execution.debt!.items[0]!.text, "API docs");
    assertEquals(reloaded.execution.debt!.fromIteration, 2);
    assertEquals(reloaded.execution.debt!.unaddressedIterations, 2);

    // Compiler still shows debt after reload
    const output = compiler.compile(
      reloaded,
      noConcerns,
      noRules,
    ) as compiler.ExecutionOutput;

    assertEquals(output.previousIterationDebt !== undefined, true);
  });
});
