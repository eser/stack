// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Minimal scene deltas so the server broadcasts only what changed.
 *
 * Top-level scalars (mode, activeTab, focusedPane, viewport) are compared
 * field-by-field; the tab list and pane list are compared structurally and sent
 * whole when they differ (they are small and change rarely relative to output).
 *
 * @module
 */

import type { Chrome } from "../engine/geometry.ts";
import type { PaneId, Viewport } from "../engine/types.ts";
import type { Scene, ScenePane, SceneTab } from "./scene.ts";

export type SceneDelta = {
  mode?: Scene["mode"];
  activeTab?: number;
  focusedPane?: PaneId | null;
  viewport?: Viewport;
  tabs?: readonly SceneTab[];
  panes?: readonly ScenePane[];
  chrome?: Chrome;
};

const sameChrome = (a: Chrome, b: Chrome): boolean =>
  a.tabBarRows === b.tabBarRows &&
  a.statusBarRows === b.statusBarRows &&
  (a.leftCols ?? 0) === (b.leftCols ?? 0) &&
  (a.rightCols ?? 0) === (b.rightCols ?? 0) &&
  (a.topRows ?? 0) === (b.topRows ?? 0) &&
  (a.bottomRows ?? 0) === (b.bottomRows ?? 0);

const sameTabs = (a: readonly SceneTab[], b: readonly SceneTab[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id || a[i]!.name !== b[i]!.name) return false;
  }

  return true;
};

const samePane = (a: ScenePane, b: ScenePane): boolean =>
  a.id === b.id &&
  a.kind === b.kind &&
  a.title === b.title &&
  a.focused === b.focused &&
  a.exited === b.exited &&
  a.geom.x === b.geom.x &&
  a.geom.y === b.geom.y &&
  a.geom.width === b.geom.width &&
  a.geom.height === b.geom.height;

const samePanes = (
  a: readonly ScenePane[],
  b: readonly ScenePane[],
): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!samePane(a[i]!, b[i]!)) return false;
  }

  return true;
};

const sameViewport = (a: Viewport, b: Viewport): boolean =>
  a.cols === b.cols && a.rows === b.rows;

/**
 * Compute the delta from `prev` to `next`, or `null` when nothing changed.
 * A `null` `prev` yields a full delta (everything), for a fresh attach.
 */
export const diffScene = (
  prev: Scene | null,
  next: Scene,
): SceneDelta | null => {
  if (prev === null) {
    return {
      mode: next.mode,
      activeTab: next.activeTab,
      focusedPane: next.focusedPane,
      viewport: next.viewport,
      tabs: next.tabs,
      panes: next.panes,
      chrome: next.chrome,
    };
  }

  const delta: SceneDelta = {};
  let changed = false;

  if (prev.mode !== next.mode) {
    delta.mode = next.mode;
    changed = true;
  }
  if (prev.activeTab !== next.activeTab) {
    delta.activeTab = next.activeTab;
    changed = true;
  }
  if (prev.focusedPane !== next.focusedPane) {
    delta.focusedPane = next.focusedPane;
    changed = true;
  }
  if (!sameViewport(prev.viewport, next.viewport)) {
    delta.viewport = next.viewport;
    changed = true;
  }
  if (!sameTabs(prev.tabs, next.tabs)) {
    delta.tabs = next.tabs;
    changed = true;
  }
  if (!samePanes(prev.panes, next.panes)) {
    delta.panes = next.panes;
    changed = true;
  }
  if (!sameChrome(prev.chrome, next.chrome)) {
    delta.chrome = next.chrome;
    changed = true;
  }

  return changed ? delta : null;
};
