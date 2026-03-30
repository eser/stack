// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Watch command tests — snapshot building and rendering.
 * Tests the pure functions without file watching.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import type { WatchSnapshot } from "./watch.ts";
import { renderJsonLine, renderTerminal } from "./watch.ts";

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

describe("Watch snapshot: correct data extraction", () => {
  it("shows spec name", () => {
    const snap = baseSnapshot();
    assertEquals(snap.spec, "photo-upload");
  });

  it("shows iteration count", () => {
    assertEquals(baseSnapshot().iteration, 7);
  });

  it("shows debt items", () => {
    const snap = baseSnapshot();
    assertEquals(snap.debt !== null, true);
    assertEquals(snap.debt!.items.length, 1);
    assertEquals(snap.debt!.items[0]!.text, "API docs not yet written");
  });

  it("shows tracked files", () => {
    const snap = baseSnapshot();
    assertEquals(snap.trackedFiles.length, 1);
    assertEquals(snap.trackedFiles[0], "src/api/v1/listings/price.ts");
  });

  it("computes time since update", () => {
    const snap = baseSnapshot();
    assertEquals(snap.timeSinceUpdate !== null, true);
    assertEquals(typeof snap.timeSinceUpdate, "number");
  });
});

// =============================================================================
// Terminal rendering
// =============================================================================

describe("Watch terminal rendering", () => {
  it("includes spec name in header", () => {
    const output = renderTerminal(baseSnapshot());
    assertEquals(output.includes("photo-upload"), true);
  });

  it("shows phase", () => {
    const output = renderTerminal(baseSnapshot());
    assertEquals(output.includes("EXECUTING"), true);
  });

  it("shows iteration", () => {
    const output = renderTerminal(baseSnapshot());
    assertEquals(output.includes("Iteration: 7"), true);
  });

  it("shows debt", () => {
    const output = renderTerminal(baseSnapshot());
    assertEquals(output.includes("Debt: 1"), true);
    assertEquals(output.includes("API docs not yet written"), true);
  });

  it("shows files changed", () => {
    const output = renderTerminal(baseSnapshot());
    assertEquals(output.includes("Files changed"), true);
  });

  it("shows concerns", () => {
    const output = renderTerminal(baseSnapshot());
    assertEquals(output.includes("open-source"), true);
  });

  it("shows task-based progress bar", () => {
    const output = renderTerminal(baseSnapshot());
    assertEquals(output.includes("3/5 tasks"), true);
    assertEquals(output.includes("60%"), true);
  });

  it("shows active task", () => {
    const output = renderTerminal(baseSnapshot());
    assertEquals(output.includes("Active task"), true);
    assertEquals(output.includes("task-4"), true);
    assertEquals(output.includes("Add price suggestion"), true);
  });

  it("omits active task when none", () => {
    const snap = {
      ...baseSnapshot(),
      activeTaskId: null,
      activeTaskTitle: null,
    };
    const output = renderTerminal(snap);
    assertEquals(output.includes("Active task"), false);
  });

  it("shows context warning when under threshold", () => {
    const output = renderTerminal(baseSnapshot());
    assertEquals(output.includes("7/15"), true);
  });

  it("shows RESTART RECOMMENDED when over threshold", () => {
    const snap = { ...baseSnapshot(), iteration: 16 };
    const output = renderTerminal(snap);
    assertEquals(output.includes("RESTART RECOMMENDED"), true);
  });
});

// =============================================================================
// Phase-specific rendering
// =============================================================================

describe("Watch phase-specific display", () => {
  it("DISCOVERY shows question count", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      phase: "DISCOVERY",
      discoveryAnswered: 3,
      discoveryTotal: 6,
    };
    const output = renderTerminal(snap);
    assertEquals(output.includes("3/6 questions"), true);
  });

  it("SPEC_DRAFT shows awaiting approval", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      phase: "SPEC_DRAFT",
    };
    const output = renderTerminal(snap);
    assertEquals(output.includes("approval"), true);
  });

  it("BLOCKED shows reason and human input needed", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      phase: "BLOCKED",
      lastProgress: "BLOCKED: need API key decision",
    };
    const output = renderTerminal(snap);
    assertEquals(output.includes("BLOCKED"), true);
    assertEquals(output.includes("Human input needed"), true);
  });

  it("COMPLETED shows completion summary", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      phase: "COMPLETED",
    };
    const output = renderTerminal(snap);
    assertEquals(output.includes("Complete"), true);
  });
});

// =============================================================================
// JSON line mode
// =============================================================================

describe("Watch JSON line mode", () => {
  it("emits valid JSON", () => {
    const line = renderJsonLine(baseSnapshot());
    const parsed = JSON.parse(line);

    assertEquals(parsed.phase, "EXECUTING");
    assertEquals(parsed.spec, "photo-upload");
    assertEquals(parsed.iteration, 7);
  });

  it("includes timestamp", () => {
    const line = renderJsonLine(baseSnapshot());
    const parsed = JSON.parse(line);

    assertEquals(typeof parsed.ts, "string");
    assertEquals(parsed.ts.includes("T"), true);
  });

  it("includes debt count", () => {
    const line = renderJsonLine(baseSnapshot());
    const parsed = JSON.parse(line);

    assertEquals(parsed.debt, 1);
  });

  it("includes active task and task counts", () => {
    const line = renderJsonLine(baseSnapshot());
    const parsed = JSON.parse(line);

    assertEquals(parsed.activeTask, "task-4");
    assertEquals(parsed.tasks.completed, 3);
    assertEquals(parsed.tasks.total, 5);
  });

  it("includes files changed", () => {
    const line = renderJsonLine(baseSnapshot());
    const parsed = JSON.parse(line);

    assertEquals(Array.isArray(parsed.filesChanged), true);
    assertEquals(parsed.filesChanged.length, 1);
  });

  it("zero debt when no debt", () => {
    const snap: WatchSnapshot = { ...baseSnapshot(), debt: null };
    const line = renderJsonLine(snap);
    const parsed = JSON.parse(line);

    assertEquals(parsed.debt, 0);
  });
});

// =============================================================================
// Status flags
// =============================================================================

describe("Watch status flags", () => {
  it("shows status report pending", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      awaitingStatusReport: true,
    };
    const output = renderTerminal(snap);
    assertEquals(output.includes("Status report pending"), true);
  });

  it("shows verification failed", () => {
    const snap: WatchSnapshot = {
      ...baseSnapshot(),
      verificationPassed: false,
    };
    const output = renderTerminal(snap);
    assertEquals(output.includes("Verification failed"), true);
  });
});
