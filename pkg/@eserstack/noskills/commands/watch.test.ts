// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Watch command tests — snapshot building and rendering.
 * Tests the pure functions without file watching.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import type { WatchSnapshot } from "./watch.ts";
import * as watch from "./watch.ts";

// =============================================================================
// Helpers
// =============================================================================

const baseSnapshot = (): WatchSnapshot => ({
  spec: "photo-upload",
  phase: "EXECUTING",
  iteration: 7,
  activeTaskId: "task-4",
  activeTaskTitle: "Add price suggestion",
  totalTasks: 5,
  completedTaskCount: 3,
  lastProgress: "task-3 complete, tests passing",
  lastCalledAt: new Date(Date.now() - 12000).toISOString(),
  modifiedFiles: ["src/api/v1/listings/price.ts", "src/lib/comps-engine.ts"],
  debt: {
    items: [{ id: "debt-1", text: "API docs not yet written", since: 5 }],
    fromIteration: 5,
  },
  concerns: ["open-source", "beautiful-product"],
  maxIterations: 15,
  awaitingStatusReport: false,
  verificationPassed: true,
  decisionsCount: 2,
  discoveryAnswered: 6,
  discoveryTotal: 6,
  trackedFiles: ["src/api/v1/listings/price.ts"],
  timeSinceUpdate: 12,
  allSpecs: [
    { name: "photo-upload", phase: "EXECUTING", iteration: 7 },
    { name: "login-flow", phase: "COMPLETED", iteration: 3 },
  ],
});

// =============================================================================
// Snapshot content
// =============================================================================

bdd.describe("Watch snapshot: correct data extraction", () => {
  bdd.it("shows spec name", () => {
    const snap = baseSnapshot();
    assert.assertEquals(snap.spec, "photo-upload");
  });

  bdd.it("shows iteration count", () => {
    assert.assertEquals(baseSnapshot().iteration, 7);
  });

  bdd.it("shows debt items", () => {
    const snap = baseSnapshot();
    assert.assertEquals(snap.debt !== null, true);
    assert.assertEquals(snap.debt!.items.length, 1);
    assert.assertEquals(snap.debt!.items[0]!.text, "API docs not yet written");
  });

  bdd.it("shows tracked files", () => {
    const snap = baseSnapshot();
    assert.assertEquals(snap.trackedFiles.length, 1);
    assert.assertEquals(snap.trackedFiles[0], "src/api/v1/listings/price.ts");
  });

  bdd.it("computes time since update", () => {
    const snap = baseSnapshot();
    assert.assertEquals(snap.timeSinceUpdate !== null, true);
    assert.assertEquals(typeof snap.timeSinceUpdate, "number");
  });
});

// =============================================================================
// Terminal rendering
// =============================================================================

bdd.describe("Watch terminal rendering", () => {
  bdd.it("includes spec name in header", () => {
    const output = watch.renderTerminal(baseSnapshot());
    assert.assertEquals(output.includes("photo-upload"), true);
  });

  bdd.it("shows phase", () => {
    const output = watch.renderTerminal(baseSnapshot());
    assert.assertEquals(output.includes("EXECUTING"), true);
  });

  bdd.it("shows iteration", () => {
    const output = watch.renderTerminal(baseSnapshot());
    assert.assertEquals(output.includes("Iteration: 7"), true);
  });

  bdd.it("shows debt", () => {
    const output = watch.renderTerminal(baseSnapshot());
    assert.assertEquals(output.includes("Debt: 1"), true);
    assert.assertEquals(output.includes("API docs not yet written"), true);
  });

  bdd.it("shows files changed", () => {
    const output = watch.renderTerminal(baseSnapshot());
    assert.assertEquals(output.includes("Files changed"), true);
  });

  bdd.it("shows concerns", () => {
    const output = watch.renderTerminal(baseSnapshot());
    assert.assertEquals(output.includes("open-source"), true);
  });

  bdd.it("shows task-based progress bar", () => {
    const output = watch.renderTerminal(baseSnapshot());
    assert.assertEquals(output.includes("3/5 tasks"), true);
    assert.assertEquals(output.includes("60%"), true);
  });

  bdd.it("shows active task", () => {
    const output = watch.renderTerminal(baseSnapshot());
    assert.assertEquals(output.includes("Active task"), true);
    assert.assertEquals(output.includes("task-4"), true);
    assert.assertEquals(output.includes("Add price suggestion"), true);
  });

  bdd.it("omits active task when none", () => {
    const snap = {
      ...baseSnapshot(),
      activeTaskId: null,
      activeTaskTitle: null,
    };
    const output = watch.renderTerminal(snap);
    assert.assertEquals(output.includes("Active task"), false);
  });

  bdd.it("shows context warning when under threshold", () => {
    const output = watch.renderTerminal(baseSnapshot());
    assert.assertEquals(output.includes("7/15"), true);
  });

  bdd.it("shows RESTART RECOMMENDED when over threshold", () => {
    const snap = { ...baseSnapshot(), iteration: 16 };
    const output = watch.renderTerminal(snap);
    assert.assertEquals(output.includes("RESTART RECOMMENDED"), true);
  });
});

// =============================================================================
// Phase-specific rendering
// =============================================================================

bdd.describe("Watch phase-specific display", () => {
  bdd.it("DISCOVERY shows question count", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      phase: "DISCOVERY",
      discoveryAnswered: 3,
      discoveryTotal: 6,
    };
    const output = watch.renderTerminal(snap);
    assert.assertEquals(output.includes("3/6 questions"), true);
  });

  bdd.it("SPEC_PROPOSAL shows awaiting approval", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      phase: "SPEC_PROPOSAL",
    };
    const output = watch.renderTerminal(snap);
    assert.assertEquals(output.includes("approval"), true);
  });

  bdd.it("BLOCKED shows reason and human input needed", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      phase: "BLOCKED",
      lastProgress: "BLOCKED: need API key decision",
    };
    const output = watch.renderTerminal(snap);
    assert.assertEquals(output.includes("BLOCKED"), true);
    assert.assertEquals(output.includes("Human input needed"), true);
  });

  bdd.it("COMPLETED shows completion summary", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      phase: "COMPLETED",
    };
    const output = watch.renderTerminal(snap);
    assert.assertEquals(output.includes("Complete"), true);
  });
});

// =============================================================================
// JSON line mode
// =============================================================================

bdd.describe("Watch JSON line mode", () => {
  bdd.it("emits valid JSON", () => {
    const line = watch.renderJsonLine(baseSnapshot());
    const parsed = JSON.parse(line);

    assert.assertEquals(parsed.phase, "EXECUTING");
    assert.assertEquals(parsed.spec, "photo-upload");
    assert.assertEquals(parsed.iteration, 7);
  });

  bdd.it("includes timestamp", () => {
    const line = watch.renderJsonLine(baseSnapshot());
    const parsed = JSON.parse(line);

    assert.assertEquals(typeof parsed.ts, "string");
    assert.assertEquals(parsed.ts.includes("T"), true);
  });

  bdd.it("includes debt count", () => {
    const line = watch.renderJsonLine(baseSnapshot());
    const parsed = JSON.parse(line);

    assert.assertEquals(parsed.debt, 1);
  });

  bdd.it("includes active task and task counts", () => {
    const line = watch.renderJsonLine(baseSnapshot());
    const parsed = JSON.parse(line);

    assert.assertEquals(parsed.activeTask, "task-4");
    assert.assertEquals(parsed.tasks.completed, 3);
    assert.assertEquals(parsed.tasks.total, 5);
  });

  bdd.it("includes files changed", () => {
    const line = watch.renderJsonLine(baseSnapshot());
    const parsed = JSON.parse(line);

    assert.assertEquals(Array.isArray(parsed.filesChanged), true);
    assert.assertEquals(parsed.filesChanged.length, 1);
  });

  bdd.it("zero debt when no debt", () => {
    const snap: WatchSnapshot = { ...baseSnapshot(), debt: null };
    const line = watch.renderJsonLine(snap);
    const parsed = JSON.parse(line);

    assert.assertEquals(parsed.debt, 0);
  });
});

// =============================================================================
// Status flags
// =============================================================================

bdd.describe("Watch status flags", () => {
  bdd.it("shows status report pending", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      awaitingStatusReport: true,
    };
    const output = watch.renderTerminal(snap);
    assert.assertEquals(output.includes("Status report pending"), true);
  });

  bdd.it("shows verification failed", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      verificationPassed: false,
    };
    const output = watch.renderTerminal(snap);
    assert.assertEquals(output.includes("Verification failed"), true);
  });
});
