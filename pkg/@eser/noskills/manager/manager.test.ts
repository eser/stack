// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as tui from "@eser/shell/tui";
import * as types from "./types.ts";
import * as tabManager from "./tab-manager.ts";
import * as keyboardRouter from "./keyboard-router.ts";

// =============================================================================
// Tab manager
// =============================================================================

describe("tab manager", () => {
  const mockTab = (): types.ManagerTab => ({
    id: "tab-1",
    spec: "test-spec",
    mode: "spec",
    sessionId: "abc123",
    process: null,
    buffer: [],
    widget: null,
    active: true,
    phase: "EXECUTING",
  });

  it("createTab adds tab and selects it", () => {
    const state = types.createInitialState();
    const result = tabManager.createTab(state, mockTab());

    assertEquals(result.tabs.length, 1);
    assertEquals(result.selectedTabIndex, 0);
    assertEquals(result.tabs[0]!.spec, "test-spec");
  });

  it("switchTab changes selected index", () => {
    let state = types.createInitialState();
    state = tabManager.createTab(state, mockTab());
    state = tabManager.createTab(state, {
      ...mockTab(),
      id: "tab-2",
      spec: "other",
    });

    const result = tabManager.switchTab(state, 0);
    assertEquals(result.selectedTabIndex, 0);
  });

  it("closeTab removes tab", () => {
    let state = types.createInitialState();
    state = tabManager.createTab(state, mockTab());
    const result = tabManager.closeTab(state, "tab-1");

    assertEquals(result.tabs.length, 0);
  });

  it("appendToBuffer adds lines", () => {
    const tab = mockTab();
    tabManager.appendToBuffer(tab, "hello\nworld");

    assertEquals(tab.buffer.length, 2);
    assertEquals(tab.buffer[0], "hello");
    assertEquals(tab.buffer[1], "world");
  });

  it("appendToBuffer caps at 1000 lines", () => {
    const tab = mockTab();
    for (let i = 0; i < 1100; i++) {
      tabManager.appendToBuffer(tab, `line ${i}`);
    }
    assertEquals(tab.buffer.length, 1000);
  });

  it("getActiveTab returns correct tab", () => {
    let state = types.createInitialState();
    state = tabManager.createTab(state, mockTab());
    const tab = tabManager.getActiveTab(state);

    assertEquals(tab !== null, true);
    assertEquals(tab!.id, "tab-1");
  });

  it("getActiveTab returns null when no tabs", () => {
    const state = types.createInitialState();
    assertEquals(tabManager.getActiveTab(state), null);
  });
});

// =============================================================================
// Keyboard router
// =============================================================================

describe("keyboard router", () => {
  it("list focus: up → navigate up", () => {
    const state = { ...types.createInitialState(), focus: "list" as const };
    const action = keyboardRouter.routeKey(state, "up", false);

    assertEquals(action.type, "navigate");
  });

  it("list focus: down → navigate down", () => {
    const state = { ...types.createInitialState(), focus: "list" as const };
    const action = keyboardRouter.routeKey(state, "down", false);

    assertEquals(action.type, "navigate");
  });

  it("list focus: return → select", () => {
    const state = { ...types.createInitialState(), focus: "list" as const };
    const action = keyboardRouter.routeKey(state, "return", false);

    assertEquals(action.type, "select");
  });

  it("list focus: n → newTab", () => {
    const state = { ...types.createInitialState(), focus: "list" as const };
    const action = keyboardRouter.routeKey(state, "n", false);

    assertEquals(action.type, "newTab");
  });

  it("list focus: q → quit", () => {
    const state = { ...types.createInitialState(), focus: "list" as const };
    const action = keyboardRouter.routeKey(state, "q", false);

    assertEquals(action.type, "quit");
  });

  it("terminal focus: keys pass through", () => {
    const state = {
      ...types.createInitialState(),
      focus: "terminal" as const,
    };
    const action = keyboardRouter.routeKey(state, "a", false);

    assertEquals(action.type, "passthrough");
  });

  it("ctrl+c always quits", () => {
    const state = {
      ...types.createInitialState(),
      focus: "terminal" as const,
    };
    const action = keyboardRouter.routeKey(state, "c", true);

    assertEquals(action.type, "quit");
  });

  it("tab toggles focus", () => {
    const state = { ...types.createInitialState(), focus: "list" as const };
    const action = keyboardRouter.routeKey(state, "tab", false);

    assertEquals(action.type, "toggleFocus");
  });

  it("toggleFocus switches list↔terminal", () => {
    const listState = {
      ...types.createInitialState(),
      focus: "list" as const,
    };
    assertEquals(keyboardRouter.toggleFocus(listState).focus, "terminal");

    const termState = {
      ...types.createInitialState(),
      focus: "terminal" as const,
    };
    assertEquals(keyboardRouter.toggleFocus(termState).focus, "list");
  });

  it("navigateList skips non-selectable items", () => {
    const items: tui.list.ListItem[] = [
      { label: "spec-a" },
      { label: "---", selectable: false },
      { label: "[n] New spec" },
    ];
    const state = {
      ...types.createInitialState(),
      selectedTabIndex: 0,
      focus: "list" as const,
    };

    // Navigate down from index 0 → should skip index 1 (separator), land on 2
    const result = keyboardRouter.navigateList(state, "down", items);
    assertEquals(result.selectedTabIndex, 2);
  });

  it("navigateList stays put when no selectable in direction", () => {
    const items: tui.list.ListItem[] = [
      { label: "spec-a" },
      { label: "---", selectable: false },
    ];
    const state = {
      ...types.createInitialState(),
      selectedTabIndex: 0,
      focus: "list" as const,
    };

    // Navigate down from 0 → index 1 is non-selectable, nothing below → stays at 0
    const result = keyboardRouter.navigateList(state, "down", items);
    assertEquals(result.selectedTabIndex, 0);
  });
});

// =============================================================================
// List selectability
// =============================================================================

describe("list nextSelectableIndex", () => {
  it("skips non-selectable going down", () => {
    const items: tui.list.ListItem[] = [
      { label: "a" },
      { label: "sep", selectable: false },
      { label: "b" },
    ];
    assertEquals(tui.list.nextSelectableIndex(items, 0, "down"), 2);
  });

  it("skips non-selectable going up", () => {
    const items: tui.list.ListItem[] = [
      { label: "a" },
      { label: "sep", selectable: false },
      { label: "b" },
    ];
    assertEquals(tui.list.nextSelectableIndex(items, 2, "up"), 0);
  });

  it("returns current when all below are non-selectable", () => {
    const items: tui.list.ListItem[] = [
      { label: "a" },
      { label: "sep", selectable: false },
    ];
    assertEquals(tui.list.nextSelectableIndex(items, 0, "down"), 0);
  });

  it("finds first selectable from -1", () => {
    const items: tui.list.ListItem[] = [
      { label: "msg", selectable: false },
      { label: "sep", selectable: false },
      { label: "action" },
    ];
    assertEquals(tui.list.nextSelectableIndex(items, -1, "down"), 2);
  });
});
