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
  | { type: "newSpec" }
  | { type: "freeMode" }
  | { type: "closeTab" }
  | { type: "quit" }
  | { type: "toggleFocus" }
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
  // Global keys
  if (ctrl && key === "c") return { type: "quit" };
  if (key === "tab") return { type: "toggleFocus" };

  if (state.focus === "list") {
    switch (key) {
      case "up":
        return { type: "navigate", direction: "up" };
      case "down":
        return { type: "navigate", direction: "down" };
      case "return":
        return { type: "select" };
      case "n":
        return { type: "newSpec" };
      case "f":
        return { type: "freeMode" };
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
