// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Section 8: Iteration Debt Tracking
 * Tests status report requests, debt carry-forward, and verification backpressure.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as compiler from "../context/compiler.ts";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = defaultConcerns.DEFAULT_CONCERNS;
const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];

const beautiful = allConcerns.find((c) => c.id === "beautiful-product")!;
const openSource = allConcerns.find((c) => c.id === "open-source")!;

const inExecuting = (): schema.StateFile => {
  let s = schema.createInitialState();
  s = machine.startSpec(s, "test-spec", "spec/test-spec");
  s = machine.completeDiscovery(s);
  s = machine.approveDiscoveryReview(s);
  // Provide classification so concern criteria are active in tests
  s = {
    ...s,
    classification: {
      involvesWebUI: true,
      involvesCLI: false,
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

bdd.describe("Status report request", () => {
  bdd.it("awaitingStatusReport=true triggers criteria in output", async () => {
    const state = withAwaitingReport(inExecuting());
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(output.statusReportRequired, true);
    assert.assertEquals(output.statusReport !== undefined, true);
    assert.assertEquals(
      output.instruction.includes("acceptance criteria"),
      true,
    );
  });

  bdd.it(
    "awaitingStatusReport=false shows normal execution instruction",
    async () => {
      const output = (await compiler.compile(
        inExecuting(),
        noConcerns,
        noRules,
      )) as compiler.ExecutionOutput;

      assert.assertEquals(output.statusReportRequired, undefined);
    },
  );
});

// =============================================================================
// 8.3 Criteria includes concern-injected items
// =============================================================================

bdd.describe("Concern-injected criteria", () => {
  bdd.it("beautiful-product adds UI state criteria", async () => {
    const state = withAwaitingReport(inExecuting());
    const output = (await compiler.compile(
      state,
      [beautiful],
      noRules,
    )) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const hasUIStates = criteria.some(
      (c) =>
        c.text.includes("beautiful-product") && c.text.includes("UI states"),
    );
    assert.assertEquals(hasUIStates, true);
  });

  bdd.it("open-source adds documentation criteria", async () => {
    const state = withAwaitingReport(inExecuting());
    const output = (await compiler.compile(
      state,
      [openSource],
      noRules,
    )) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const hasDocs = criteria.some(
      (c) => c.text.includes("open-source") && c.text.includes("documented"),
    );
    assert.assertEquals(hasDocs, true);
  });

  bdd.it("multiple concerns stack criteria", async () => {
    const state = withAwaitingReport(inExecuting());
    const output = (await compiler.compile(
      state,
      [beautiful, openSource],
      noRules,
    )) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const beautifulCount = criteria.filter((c) =>
      c.text.includes("beautiful-product"),
    ).length;
    const osCount = criteria.filter((c) =>
      c.text.includes("open-source"),
    ).length;
    assert.assertEquals(beautifulCount > 0, true);
    assert.assertEquals(osCount > 0, true);
  });
});

// =============================================================================
// Folder rules in criteria
// =============================================================================

bdd.describe("Folder rules in acceptance criteria", () => {
  bdd.it(
    "folder rules appear as (folder: path) prefixed criteria",
    async () => {
      const state = withAwaitingReport(inExecuting());
      const folderRuleCriteria = [
        {
          folder: "pkg/@eserstack/noskills/sync",
          rule: "Sync must be idempotent",
        },
        {
          folder: "pkg/@eserstack/noskills/sync",
          rule: "All commands use dynamic prefix",
        },
      ];
      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
        undefined,
        undefined,
        folderRuleCriteria,
      )) as compiler.ExecutionOutput;

      const criteria = output.statusReport?.criteria ?? [];
      const folderCriteria = criteria.filter((c) =>
        c.text.startsWith("(folder:"),
      );
      assert.assertEquals(folderCriteria.length, 2);
      assert.assertEquals(
        folderCriteria[0]!.text.includes("Sync must be idempotent"),
        true,
      );
    },
  );

  bdd.it("no folder rules when empty array passed", async () => {
    const state = withAwaitingReport(inExecuting());
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
      undefined,
      undefined,
      [],
    )) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const folderCriteria = criteria.filter((c) =>
      c.text.startsWith("(folder:"),
    );
    assert.assertEquals(folderCriteria.length, 0);
  });

  bdd.it("folder rules stack with concern criteria", async () => {
    const state = withAwaitingReport(inExecuting());
    const folderRuleCriteria = [
      { folder: "pkg/sync", rule: "Hook scripts must be self-contained" },
    ];
    const output = (await compiler.compile(
      state,
      [openSource],
      noRules,
      undefined,
      undefined,
      folderRuleCriteria,
    )) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const hasFolderRule = criteria.some((c) =>
      c.text.includes("self-contained"),
    );
    const hasConcernRule = criteria.some((c) => c.text.includes("open-source"));
    assert.assertEquals(hasFolderRule, true);
    assert.assertEquals(hasConcernRule, true);
  });
});

// =============================================================================
// 8.4-8.7 Debt carry-forward
// =============================================================================

bdd.describe("Debt carry-forward", () => {
  bdd.it(
    "8.4: debt items appear as previousIterationDebt in output",
    async () => {
      const state = withDebt(
        inExecuting(),
        debtItems(["error UI", "API docs"], 3),
        3,
      );
      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
      )) as compiler.ExecutionOutput;

      assert.assertEquals(output.previousIterationDebt !== undefined, true);
      assert.assertEquals(output.previousIterationDebt!.items.length, 2);
      assert.assertEquals(output.previousIterationDebt!.fromIteration, 3);
      assert.assertEquals(
        output.previousIterationDebt!.note.includes("BEFORE"),
        true,
      );
    },
  );

  bdd.it("8.5: debt persists when not cleared", () => {
    // Simulate: debt from iteration 3, now at iteration 5
    let state = withDebt(inExecuting(), debtItems(["error UI"], 3), 3);
    state = machine.advanceExecution(state, "step 4");
    state = machine.advanceExecution(state, "step 5");

    // Debt should still be there
    assert.assertEquals(state.execution.debt !== null, true);
    assert.assertEquals(state.execution.debt!.items.length, 1);
    assert.assertEquals(state.execution.debt!.items[0]!.text, "error UI");
  });

  bdd.it("8.7: debt note says address BEFORE new work", async () => {
    const state = withDebt(inExecuting(), debtItems(["stale item"]), 1);
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(
      output.previousIterationDebt!.note.includes("BEFORE starting new work"),
      true,
    );
  });
});

// =============================================================================
// 8.4 + 8.6: Debt in status report criteria
// =============================================================================

bdd.describe("Debt in status report criteria", () => {
  bdd.it("debt items appear with [DEBT] prefix in criteria", async () => {
    const state = withAwaitingReport(
      withDebt(inExecuting(), debtItems(["error UI design"], 2), 2),
    );
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    const criteria = output.statusReport?.criteria ?? [];
    const debtCriteria = criteria.filter((c) => c.text.includes("[DEBT"));
    assert.assertEquals(debtCriteria.length, 1);
    assert.assertEquals(
      debtCriteria[0]!.text.includes("error UI design"),
      true,
    );
  });
});

// =============================================================================
// 8.8-8.10 Verification backpressure
// =============================================================================

bdd.describe("Verification backpressure", () => {
  bdd.it(
    "8.8: failed verification shows in criteria with FAILED prefix",
    async () => {
      const state = withAwaitingReport(
        withVerifyFailed(
          inExecuting(),
          "FAIL: test_upload expected 200 got 500",
        ),
      );
      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
      )) as compiler.ExecutionOutput;

      assert.assertEquals(output.verificationFailed, true);
      const criteria = output.statusReport?.criteria ?? [];
      const failedCriteria = criteria.filter((c) =>
        c.text.includes("[FAILED]"),
      );
      assert.assertEquals(failedCriteria.length, 1);
    },
  );

  bdd.it("8.9: verification failure instruction says fix tests", async () => {
    const state = withVerifyFailed(inExecuting(), "2 tests failed");
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(output.instruction.includes("FAILED"), true);
    assert.assertEquals(output.verificationFailed, true);
  });

  bdd.it("8.10: verification success shows normal instruction", async () => {
    const state = withVerifyPassed(inExecuting());
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(output.verificationFailed, undefined);
    assert.assertEquals(output.instruction.includes("FAILED"), false);
  });
});

// =============================================================================
// Verification gates status report
// =============================================================================

bdd.describe("Verification gates status report", () => {
  bdd.it(
    "verify fails → awaitingStatusReport stays false (no status report)",
    async () => {
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
      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
      )) as compiler.ExecutionOutput;

      assert.assertEquals(output.verificationFailed, true);
      assert.assertEquals(output.statusReportRequired, undefined);
      assert.assertEquals(output.instruction.includes("FAILED"), true);
    },
  );

  bdd.it(
    "verify passes → awaitingStatusReport triggers status report",
    async () => {
      const state = withAwaitingReport(withVerifyPassed(inExecuting()));
      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
      )) as compiler.ExecutionOutput;

      assert.assertEquals(output.statusReportRequired, true);
      assert.assertEquals(output.verificationFailed, undefined);
    },
  );

  bdd.it("no verify configured → status report asked directly", async () => {
    const state = withAwaitingReport(inExecuting());
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(output.statusReportRequired, true);
  });
});

// =============================================================================
// Debt urgency escalation
// =============================================================================

bdd.describe("Debt urgency escalation", () => {
  bdd.it("unaddressedIterations < 3 → normal note", async () => {
    const state = withDebt(inExecuting(), debtItems(["error UI"]), 1, 2);
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(
      output.previousIterationDebt!.note.includes("BEFORE starting new work"),
      true,
    );
    assert.assertEquals(
      output.previousIterationDebt!.note.includes("have been open for"),
      false,
    );
  });

  bdd.it("unaddressedIterations >= 3 → URGENT note", async () => {
    const state = withDebt(inExecuting(), debtItems(["error UI"]), 1, 3);
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(
      output.previousIterationDebt!.note.includes("have been open for"),
      true,
    );
    assert.assertEquals(
      output.previousIterationDebt!.note.includes("3 iterations"),
      true,
    );
  });

  bdd.it("unaddressedIterations = 5 → shows correct count", async () => {
    const state = withDebt(inExecuting(), debtItems(["stale item"]), 1, 5);
    const output = (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(
      output.previousIterationDebt!.note.includes("5 iterations"),
      true,
    );
  });
});

// =============================================================================
// Empty remaining → no debt
// =============================================================================

bdd.describe("Empty remaining clears debt", () => {
  bdd.it(
    "remaining=[] and no old debt → no previousIterationDebt in output",
    async () => {
      const state = inExecuting();
      const output = (await compiler.compile(
        state,
        noConcerns,
        noRules,
      )) as compiler.ExecutionOutput;

      assert.assertEquals(output.previousIterationDebt, undefined);
    },
  );
});

// =============================================================================
// Debt survives state reload (simulated)
// =============================================================================

bdd.describe("Debt persists across session restart", () => {
  bdd.it("debt in state survives simulated reload", async () => {
    // Create state with debt, serialize and deserialize (simulating file persistence)
    const state = withDebt(inExecuting(), debtItems(["API docs"], 2), 2, 2);
    const serialized = JSON.stringify(state);
    const reloaded = JSON.parse(serialized) as schema.StateFile;

    assert.assertEquals(reloaded.execution.debt !== null, true);
    assert.assertEquals(reloaded.execution.debt!.items[0]!.text, "API docs");
    assert.assertEquals(reloaded.execution.debt!.fromIteration, 2);
    assert.assertEquals(reloaded.execution.debt!.unaddressedIterations, 2);

    // Compiler still shows debt after reload
    const output = (await compiler.compile(
      reloaded,
      noConcerns,
      noRules,
    )) as compiler.ExecutionOutput;

    assert.assertEquals(output.previousIterationDebt !== undefined, true);
  });
});
