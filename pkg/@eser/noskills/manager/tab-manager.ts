// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tab lifecycle — create, switch, close tabs. Buffer management (last 1000 lines).
 *
 * @module
 */

import type * as types from "./types.ts";

const MAX_BUFFER_LINES = 1000;

export const createTab = (
  state: types.ManagerState,
  tab: types.ManagerTab,
): types.ManagerState => {
  return {
    ...state,
    tabs: [...state.tabs, tab],
    selectedTabIndex: state.tabs.length,
  };
};

export const closeTab = (
  state: types.ManagerState,
  tabId: string,
): types.ManagerState => {
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return state;
  const tab = state.tabs[idx]!;
  if (tab.process !== null) tab.process.kill();
  const newTabs = state.tabs.filter((t) => t.id !== tabId);
  return {
    ...state,
    tabs: newTabs,
    selectedTabIndex: Math.min(state.selectedTabIndex, newTabs.length - 1),
  };
};

export const switchTab = (
  state: types.ManagerState,
  index: number,
): types.ManagerState => {
  if (index < 0 || index >= state.tabs.length) return state;
  return { ...state, selectedTabIndex: index };
};

export const appendToBuffer = (tab: types.ManagerTab, data: string): void => {
  const lines = data.split("\n");
  for (const line of lines) {
    tab.buffer.push(line);
  }
  if (tab.buffer.length > MAX_BUFFER_LINES) {
    tab.buffer.splice(0, tab.buffer.length - MAX_BUFFER_LINES);
  }
};

export const getActiveTab = (
  state: types.ManagerState,
): types.ManagerTab | null => {
  if (
    state.selectedTabIndex < 0 ||
    state.selectedTabIndex >= state.tabs.length
  ) {
    return null;
  }
  return state.tabs[state.selectedTabIndex] ?? null;
};
