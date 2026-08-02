// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The frontend-neutral scene model.
 *
 * The server derives a {@link Scene} from {@link MuxState} and broadcasts it
 * (plus per-pane raw output streamed separately). Every frontend — the ANSI TUI
 * compositor and a browser xterm.js app alike — renders from this same model, so
 * the core stays rendering-agnostic.
 *
 * @module
 */

import {
  type Chrome,
  computeTabGeoms,
  DEFAULT_CHROME,
} from "../engine/geometry.ts";
import { collectLeaves } from "../engine/split-tree.ts";
import type {
  Geom,
  InputMode,
  MuxState,
  PaneId,
  PaneKind,
  Viewport,
} from "../engine/types.ts";

/** A pane as the frontend needs to place and label it. */
export type ScenePane = {
  readonly id: PaneId;
  readonly kind: PaneKind;
  readonly title: string;
  readonly geom: Geom;
  readonly focused: boolean;
  readonly exited: boolean;
};

/** A tab as the frontend needs to show it in the tab bar. */
export type SceneTab = {
  readonly id: string;
  readonly name: string;
};

/** Everything a frontend needs to lay out a frame (no ANSI, no raw bytes). */
export type Scene = {
  readonly tabs: readonly SceneTab[];
  readonly activeTab: number;
  readonly mode: InputMode;
  readonly viewport: Viewport;
  readonly focusedPane: PaneId | null;
  readonly panes: readonly ScenePane[];
  /** Effective chrome the server laid panes out with; the frontend draws
   *  decorations into the same reserved regions so the two never disagree. */
  readonly chrome: Chrome;
};

/** Derive the neutral scene for the active tab from engine state. */
export const deriveScene = (
  state: MuxState,
  chrome: Chrome = DEFAULT_CHROME,
): Scene => {
  const tab = state.tabs[state.activeTab];

  if (tab === undefined) {
    return {
      tabs: [],
      activeTab: 0,
      mode: state.mode,
      viewport: state.viewport,
      focusedPane: null,
      panes: [],
      chrome,
    };
  }

  const geoms = computeTabGeoms(tab, state.viewport, chrome);
  const order = collectLeaves(tab.root);

  const panes: ScenePane[] = [];
  for (const id of order) {
    const geom = geoms.get(id);
    if (geom === undefined) continue; // hidden behind a fullscreen pane
    const pane = state.panes[id];
    panes.push({
      id,
      kind: pane?.kind ?? "terminal",
      title: pane?.title ?? id,
      geom,
      focused: id === tab.focusedPane,
      exited: pane?.exited ?? false,
    });
  }

  return {
    tabs: state.tabs.map((t) => ({ id: t.id, name: t.name })),
    activeTab: state.activeTab,
    mode: state.mode,
    viewport: state.viewport,
    focusedPane: tab.focusedPane,
    panes,
    chrome,
  };
};
