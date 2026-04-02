// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Focus management and key routing.
 *
 * @module
 */

import * as tui from "@eser/shell/tui";
import type * as types from "./types.ts";

export type KeyAction =
  | { type: "navigate"; direction: "up" | "down" }
  | { type: "select" }
  | { type: "newTab" }
  | { type: "closeTab" }
  | { type: "quit" }
  | { type: "toggleFocus" }
  | { type: "toggleSpecs" }
  | { type: "toggleMonitor" }
  | { type: "passthrough"; data: string }
  | { type: "none" };

/**
 * Route a keypress based on current focus mode.
 * Returns the action to perform.
 */
export const routeKey = (
  state: types.ManagerState,
  key: string,
  ctrl: boolean,
): KeyAction => {
  // Global keys (work in both list and terminal focus)
  if (ctrl && key === "c") return { type: "quit" };
  if (ctrl && key === "d") return { type: "quit" };
  if (ctrl && key === "t") return { type: "newTab" };
  if (key === "tab") return { type: "toggleFocus" };
  if (ctrl && key === "e") return { type: "toggleSpecs" };
  if (ctrl && key === "w") return { type: "toggleMonitor" };

  if (state.focus === "list") {
    switch (key) {
      case "up":
        return { type: "navigate", direction: "up" };
      case "down":
        return { type: "navigate", direction: "down" };
      case "return":
        return { type: "select" };
      case "n":
        return { type: "newTab" };
      case "x":
        return { type: "closeTab" };
      case "q":
        return { type: "quit" };
      default:
        return { type: "none" };
    }
  }

  // Terminal focus: pass everything through
  return { type: "passthrough", data: key };
};

export const toggleFocus = (state: types.ManagerState): types.ManagerState => ({
  ...state,
  focus: state.focus === "list" ? "terminal" : "list",
});

/**
 * Navigate list, skipping non-selectable items.
 * Requires the list items array to check selectability.
 */
export const navigateList = (
  state: types.ManagerState,
  direction: "up" | "down",
  items: readonly tui.list.ListItem[],
): types.ManagerState => {
  const next = tui.list.nextSelectableIndex(
    items,
    state.selectedTabIndex,
    direction,
  );
  return { ...state, selectedTabIndex: next };
};

// =============================================================================
// Mouse routing
// =============================================================================

export type MouseAction =
  | { type: "clickSpec"; index: number }
  | { type: "clickTerminal" }
  | { type: "clickMonitor" }
  | { type: "scrollSpecs"; direction: "up" | "down" }
  | { type: "scrollTerminal"; direction: "up" | "down" }
  | { type: "forwardMouse"; event: tui.mouse.MouseEvent }
  | { type: "none" };

const isInsidePanel = (
  mx: number,
  my: number,
  p: tui.layout.Panel,
): boolean =>
  mx >= p.x && mx < p.x + p.width && my >= p.y && my < p.y + p.height;

/**
 * Route a mouse event based on which panel it hits.
 * Returns the action to perform.
 */
export const routeMouseEvent = (
  event: tui.mouse.MouseEvent,
  panels: tui.layout.LayoutResult,
  specItems: readonly tui.list.ListItem[],
  focus: "list" | "terminal",
): MouseAction => {
  // Mouse coords are 0-based from the event, panels are 1-based
  const mx = event.x + 1;
  const my = event.y + 1;

  // Click/scroll in spec list
  if (isInsidePanel(mx, my, panels.left)) {
    if (event.type === "wheel") {
      return {
        type: "scrollSpecs",
        direction: event.direction === "up" ? "up" : "down",
      };
    }
    if (event.type === "mousedown" && event.button === 0) {
      const relRow = event.y + 1 - panels.left.y - 1; // panel-relative, accounting for border
      if (relRow >= 0 && relRow < specItems.length) {
        const item = specItems[relRow]!;
        if (item.selectable !== false) {
          return { type: "clickSpec", index: relRow };
        }
      }
    }
    return { type: "none" };
  }

  // Click/scroll in terminal panel
  if (isInsidePanel(mx, my, panels.rightBottom)) {
    if (event.type === "wheel") {
      return {
        type: "scrollTerminal",
        direction: event.direction === "up" ? "up" : "down",
      };
    }
    if (focus !== "terminal") {
      return { type: "clickTerminal" };
    }
    return { type: "forwardMouse", event };
  }

  // Click in monitor → focus spec list
  if (isInsidePanel(mx, my, panels.rightTop)) {
    return { type: "clickMonitor" };
  }

  return { type: "none" };
};
