// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The pure engine reducer: `(state, action) -> { state, effects }`.
 *
 * It is the single place that interprets actions. It performs no I/O; side
 * effects (spawn/write/kill PTY, render, exit) are returned as descriptors for
 * the server to run. Pane resizing on layout change is handled by the server
 * diffing geometry, so it is not emitted here.
 *
 * @module
 */

import type { Effect, ReducerResult } from "./effects.ts";
import {
  computeTabGeoms,
  DEFAULT_CHROME,
  neighborInDirection,
} from "./geometry.ts";
import * as tree from "./split-tree.ts";
import type {
  Action,
  MuxState,
  Pane,
  PaneKind,
  SplitDirection,
  Tab,
  Viewport,
} from "./types.ts";

const RESIZE_DELTA = 0.05;
const RENDER: readonly Effect[] = [{ type: "render" }];

/** Create an empty engine state; dispatch `newTab` to open the first tab. */
export const createInitialState = (viewport: Viewport): MuxState => ({
  panes: {},
  tabs: [],
  activeTab: 0,
  mode: "normal",
  viewport,
  running: true,
  nextPaneSeq: 1,
  nextTabSeq: 1,
});

const noop = (state: MuxState): ReducerResult => ({ state, effects: [] });

const activeTabOf = (state: MuxState): Tab | undefined =>
  state.tabs[state.activeTab];

const replaceActiveTab = (state: MuxState, tab: Tab): MuxState => ({
  ...state,
  tabs: state.tabs.map((t, i) => (i === state.activeTab ? tab : t)),
});

type PaneSpec = {
  readonly kind?: PaneKind;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly title?: string;
  readonly meta?: Readonly<Record<string, string>>;
};

const makePane = (
  state: MuxState,
  spec: PaneSpec,
): { readonly pane: Pane; readonly state: MuxState } => {
  const id = `pane-${state.nextPaneSeq}`;
  const pane: Pane = {
    id,
    kind: spec.kind ?? "terminal",
    title: spec.title ?? spec.command ?? "shell",
    cwd: spec.cwd,
    command: spec.command,
    args: spec.args,
    meta: spec.meta,
  };

  return {
    pane,
    state: {
      ...state,
      panes: { ...state.panes, [id]: pane },
      nextPaneSeq: state.nextPaneSeq + 1,
    },
  };
};

/**
 * Close the tab at `index`, killing all its panes; exits when it was the last
 * tab. Closing a tab other than the active one leaves the user's view in place:
 * activeTab only shifts to track the same tab (decrement when a lower-indexed
 * tab is removed) or clamps when the active tab itself is closed.
 */
const closeTabAt = (state: MuxState, index: number): ReducerResult => {
  const tab = state.tabs[index];
  if (tab === undefined) return noop(state);

  const paneIds = tree.collectLeaves(tab.root);
  const kills: Effect[] = paneIds.map((p) => ({ type: "killPty", pane: p }));

  const panes = { ...state.panes };
  for (const p of paneIds) delete panes[p];

  const tabs = state.tabs.filter((_, i) => i !== index);

  if (tabs.length === 0) {
    return {
      state: { ...state, panes, tabs, running: false },
      effects: [...kills, { type: "exit" }],
    };
  }

  const activeTab = index < state.activeTab
    ? state.activeTab - 1
    : Math.min(state.activeTab, tabs.length - 1);

  return {
    state: { ...state, panes, tabs, activeTab },
    effects: [...kills, { type: "render" }],
  };
};

/** Close the active tab. */
const closeActiveTab = (state: MuxState): ReducerResult =>
  closeTabAt(state, state.activeTab);

const addPane = (
  state: MuxState,
  direction: SplitDirection,
  spec: PaneSpec,
): ReducerResult => {
  const tab = activeTabOf(state);
  if (tab === undefined) return noop(state);

  const { pane, state: s1 } = makePane(state, spec);
  const root = tree.splitLeaf(tab.root, tab.focusedPane, direction, pane.id);
  const newTab: Tab = {
    ...tab,
    root,
    focusedPane: pane.id,
    fullscreenPane: undefined,
  };

  return {
    state: replaceActiveTab(s1, newTab),
    effects: [{ type: "spawnPty", pane: pane.id }, { type: "render" }],
  };
};

export const reduce = (state: MuxState, action: Action): ReducerResult => {
  switch (action.type) {
    case "switchMode":
      return { state: { ...state, mode: action.mode }, effects: RENDER };

    case "splitPane":
      return addPane(state, action.direction, {});

    case "newPane":
      return addPane(state, action.direction ?? "vertical", {
        kind: action.kind,
        command: action.command,
        args: action.args,
        cwd: action.cwd,
        title: action.title,
        meta: action.meta,
      });

    case "closeFocusedPane": {
      const tab = activeTabOf(state);
      if (tab === undefined) return noop(state);

      const closed = tab.focusedPane;
      const { root, promoted } = tree.removeLeaf(tab.root, closed);
      if (root === null) return closeActiveTab(state);

      const panes = { ...state.panes };
      delete panes[closed];

      const newTab: Tab = {
        ...tab,
        root,
        focusedPane: promoted ?? tree.firstLeaf(root),
        fullscreenPane: undefined,
      };

      return {
        state: replaceActiveTab({ ...state, panes }, newTab),
        effects: [{ type: "killPty", pane: closed }, { type: "render" }],
      };
    }

    case "focusDirection": {
      const tab = activeTabOf(state);
      if (tab === undefined) return noop(state);

      const geoms = computeTabGeoms(tab, state.viewport, DEFAULT_CHROME);
      const next = neighborInDirection(
        geoms,
        tab.focusedPane,
        action.direction,
      );
      if (next === null) return noop(state);

      return {
        state: replaceActiveTab(state, { ...tab, focusedPane: next }),
        effects: RENDER,
      };
    }

    case "focusNext":
    case "focusPrev": {
      const tab = activeTabOf(state);
      if (tab === undefined) return noop(state);

      const leaves = tree.collectLeaves(tab.root);
      if (leaves.length <= 1) return noop(state);

      const idx = leaves.indexOf(tab.focusedPane);
      const step = action.type === "focusNext" ? 1 : -1;
      const focusedPane = leaves[(idx + step + leaves.length) % leaves.length]!;

      return {
        state: replaceActiveTab(state, { ...tab, focusedPane }),
        effects: RENDER,
      };
    }

    case "focusPane": {
      const tab = activeTabOf(state);
      if (tab === undefined || !tree.hasLeaf(tab.root, action.pane)) {
        return noop(state);
      }

      return {
        state: replaceActiveTab(state, { ...tab, focusedPane: action.pane }),
        effects: RENDER,
      };
    }

    case "toggleFullscreen": {
      const tab = activeTabOf(state);
      if (tab === undefined) return noop(state);

      const fullscreenPane = tab.fullscreenPane === tab.focusedPane
        ? undefined
        : tab.focusedPane;

      return {
        state: replaceActiveTab(state, { ...tab, fullscreenPane }),
        effects: RENDER,
      };
    }

    case "resizePane": {
      const tab = activeTabOf(state);
      if (tab === undefined) return noop(state);

      const root = tree.resizeFocused(
        tab.root,
        tab.focusedPane,
        action.direction,
        RESIZE_DELTA,
      );
      if (root === tab.root) return noop(state);

      return {
        state: replaceActiveTab(state, { ...tab, root }),
        effects: RENDER,
      };
    }

    case "newTab": {
      const id = `tab-${state.nextTabSeq}`;
      const { pane, state: s1 } = makePane(state, {
        kind: action.kind,
        command: action.command,
        args: action.args,
        cwd: action.cwd,
        title: action.title,
        meta: action.meta,
      });
      const tab: Tab = {
        id,
        name: action.title ?? `tab ${state.nextTabSeq}`,
        root: tree.leaf(pane.id),
        focusedPane: pane.id,
      };
      const tabs = [...s1.tabs, tab];

      return {
        state: {
          ...s1,
          tabs,
          activeTab: tabs.length - 1,
          nextTabSeq: s1.nextTabSeq + 1,
        },
        effects: [{ type: "spawnPty", pane: pane.id }, { type: "render" }],
      };
    }

    case "closeTab":
      return closeTabAt(state, action.index ?? state.activeTab);

    case "gotoTab": {
      if (action.index < 0 || action.index >= state.tabs.length) {
        return noop(state);
      }

      return { state: { ...state, activeTab: action.index }, effects: RENDER };
    }

    case "nextTab":
    case "prevTab": {
      if (state.tabs.length <= 1) return noop(state);

      const step = action.type === "nextTab" ? 1 : -1;
      const activeTab = (state.activeTab + step + state.tabs.length) %
        state.tabs.length;

      return { state: { ...state, activeTab }, effects: RENDER };
    }

    case "scroll": {
      const tab = activeTabOf(state);
      if (tab === undefined) return noop(state);

      return {
        state,
        effects: [{
          type: "scrollPane",
          pane: tab.focusedPane,
          action: action.action,
        }],
      };
    }

    case "writeInput": {
      const tab = activeTabOf(state);
      if (tab === undefined) return noop(state);

      return {
        state,
        effects: [{
          type: "writePty",
          pane: tab.focusedPane,
          data: action.data,
        }],
      };
    }

    case "writeToPane": {
      // Address a specific pane regardless of focus (e.g. agent driving, or a
      // web client notifying the pane bound to a spec). Ignore unknown panes.
      if (state.panes[action.pane] === undefined) return noop(state);

      return {
        state,
        effects: [{ type: "writePty", pane: action.pane, data: action.data }],
      };
    }

    case "resizeViewport":
      return {
        state: { ...state, viewport: { cols: action.cols, rows: action.rows } },
        effects: RENDER,
      };

    case "paneExited": {
      const tabIndex = state.tabs.findIndex((t) =>
        tree.hasLeaf(t.root, action.pane)
      );
      if (tabIndex < 0) return noop(state);

      const tab = state.tabs[tabIndex]!;
      const { root, promoted } = tree.removeLeaf(tab.root, action.pane);

      const panes = { ...state.panes };
      delete panes[action.pane];

      if (root === null) {
        const tabs = state.tabs.filter((_, i) => i !== tabIndex);
        if (tabs.length === 0) {
          return {
            state: { ...state, panes, tabs, running: false },
            effects: [{ type: "exit" }],
          };
        }

        // A tab before the active one shifts every later index down by one, so
        // decrement to keep viewing the same tab; otherwise just clamp.
        const activeTab = tabIndex < state.activeTab
          ? state.activeTab - 1
          : Math.min(state.activeTab, tabs.length - 1);

        return {
          state: { ...state, panes, tabs, activeTab },
          effects: RENDER,
        };
      }

      const focusedPane = tab.focusedPane === action.pane
        ? (promoted ?? tree.firstLeaf(root))
        : tab.focusedPane;
      const fullscreenPane = tab.fullscreenPane === action.pane
        ? undefined
        : tab.fullscreenPane;
      const newTab: Tab = { ...tab, root, focusedPane, fullscreenPane };

      return {
        state: {
          ...state,
          panes,
          tabs: state.tabs.map((t, i) => (i === tabIndex ? newTab : t)),
        },
        effects: RENDER,
      };
    }

    case "detach":
      return { state, effects: [{ type: "detach" }] };

    case "quit":
      return {
        state: { ...state, running: false },
        effects: [{ type: "exit" }],
      };
  }
};
