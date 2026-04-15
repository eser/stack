// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import * as tui from "@eserstack/shell/tui";
import * as tabBarMod from "./tab-bar.ts";
import type * as types from "./types.ts";

// =============================================================================
// Helpers
// =============================================================================

const makeTab = (
  id: string,
  spec: string | null,
  phase: string | null = null,
): types.ManagerTab => ({
  id,
  spec,
  mode: spec !== null ? "spec" : "free",
  sessionId: `sess-${id}`,
  process: null,
  buffer: [],
  widget: null,
  active: false,
  phase,
});

// =============================================================================
// Tab bar rendering
// =============================================================================

describe("tab-bar", () => {
  it("renders empty state when no tabs", () => {
    const output = tabBarMod.render([], -1, 80, 1);
    const visible = tui.ansi.stripAnsi(output);
    assert(visible.includes("No tabs"));
    assert(visible.includes("press n"));
  });

  it("renders single tab with number", () => {
    const tabs = [makeTab("t1", null)];
    const output = tabBarMod.render(tabs, 0, 80, 1);
    const visible = tui.ansi.stripAnsi(output);
    assert(visible.includes("1:IDLE"));
  });

  it("renders spec-bound tab with spec name", () => {
    const tabs = [makeTab("t1", "upload", "EXECUTING")];
    const output = tabBarMod.render(tabs, 0, 80, 1);
    const visible = tui.ansi.stripAnsi(output);
    assert(visible.includes("upload"));
    assert(visible.includes("EXEC"));
  });

  it("renders multiple tabs", () => {
    const tabs = [
      makeTab("t1", "upload", "EXECUTING"),
      makeTab("t2", null),
      makeTab("t3", "invoice", "SPEC_PROPOSAL"),
    ];
    const output = tabBarMod.render(tabs, 0, 120, 1);
    const visible = tui.ansi.stripAnsi(output);
    assert(visible.includes("1:upload"));
    assert(visible.includes("2:IDLE"));
    assert(visible.includes("3:invoice"));
  });

  it("active tab is highlighted (inverse)", () => {
    const tabs = [makeTab("t1", null), makeTab("t2", "upload")];
    const output = tabBarMod.render(tabs, 1, 80, 1);
    // Active tab (index 1) should have inverse escape sequence
    // The inverse wrapper is \x1b[7m...\x1b[27m
    assert(output.includes("\x1b[7m"));
  });

  it("inactive tab is dimmed", () => {
    const tabs = [makeTab("t1", null), makeTab("t2", "upload")];
    const output = tabBarMod.render(tabs, 0, 80, 1);
    // Tab at index 1 (inactive) should have dim
    assert(output.includes("\x1b[2m"));
  });

  it("tab bar respects width parameter", () => {
    const tabs = [makeTab("t1", null)];
    const output = tabBarMod.render(tabs, 0, 40, 1);
    const visible = tui.ansi.stripAnsi(output);
    // Output should not exceed width (allow for escape sequences)
    assertEquals(visible.length, 40);
  });

  it("includes separator between tabs", () => {
    const tabs = [makeTab("t1", null), makeTab("t2", null)];
    const output = tabBarMod.render(tabs, 0, 80, 1);
    // Should contain the │ separator
    assert(
      output.includes("\u2502") || tui.ansi.stripAnsi(output).includes("|"),
    );
  });

  it("positions at specified row and column", () => {
    const tabs = [makeTab("t1", null)];
    const output = tabBarMod.render(tabs, 0, 80, 3, 5);
    // Should contain moveTo(3, 5) = \x1b[3;5H
    assert(output.includes("\x1b[3;5H"));
  });
});
