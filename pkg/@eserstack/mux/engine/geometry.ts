// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Maps the binary split tree onto the existing flex-layout engine.
 *
 * Rather than write a second layout solver, each {@link SplitNode} is converted
 * to a `FlexNode` and handed to `flexLayout.computeLayout`. Split ratios become
 * flex grow weights. Coordinates are 0-based; the y-axis is offset by the tab
 * bar, and the compositor adds per-pane border insets on top.
 *
 * Direction mapping (see {@link SplitDirection}): `"vertical"` → flex `"row"`
 * (side by side), `"horizontal"` → flex `"column"` (stacked).
 *
 * @module
 */

import * as tui from "@eserstack/shell/tui";
import type { Geom, PaneId, SplitNode, Tab, Viewport } from "./types.ts";

/**
 * Screen regions reserved around the pane area.
 *
 * `tabBarRows`/`statusBarRows` are the full-width top/bottom strips. The optional
 * `leftCols`/`rightCols`/`topRows`/`bottomRows` reserve space for consumer
 * "decorations" (e.g. a spec-list sidebar or a status monitor); panes lay out
 * inside what's left. The same Chrome must be given to the server (for geometry)
 * and the frontend (for drawing the decorations) so they agree.
 */
export type Chrome = {
  readonly tabBarRows: number;
  readonly statusBarRows: number;
  readonly leftCols?: number;
  readonly rightCols?: number;
  readonly topRows?: number;
  readonly bottomRows?: number;
};

/** One row for the tab bar, one for the status bar — used by the reducer and compositor alike. */
export const DEFAULT_CHROME: Chrome = { tabBarRows: 1, statusBarRows: 1 };

const MIN_PANE_COLS = 10;
const MIN_PANE_ROWS = 3;

/**
 * Drop decoration reservations that would starve the pane area, so a small
 * terminal still shows panes instead of going blank. The server lays out with
 * this (and broadcasts it in the scene) so frontends draw decorations to match.
 */
export const effectiveChrome = (viewport: Viewport, chrome: Chrome): Chrome => {
  let leftCols = chrome.leftCols ?? 0;
  let rightCols = chrome.rightCols ?? 0;
  let topRows = chrome.topRows ?? 0;
  let bottomRows = chrome.bottomRows ?? 0;

  if (viewport.cols - leftCols - rightCols < MIN_PANE_COLS) {
    leftCols = 0;
    rightCols = 0;
  }

  const verticalChrome = chrome.tabBarRows + chrome.statusBarRows + topRows +
    bottomRows;
  if (viewport.rows - verticalChrome < MIN_PANE_ROWS) {
    topRows = 0;
    bottomRows = 0;
  }

  return { ...chrome, leftCols, rightCols, topRows, bottomRows };
};

/** A 1-based screen rectangle (ready to pass to box/ansi drawing helpers). */
export type Region = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** Reserved decoration regions for a viewport, in 1-based screen coordinates. */
export type DecorationRegions = {
  readonly left?: Region;
  readonly right?: Region;
  readonly top?: Region;
  readonly bottom?: Region;
};

/**
 * Compute the 1-based decoration rectangles implied by a Chrome. The left/right
 * sidebars span the full content band; the top/bottom strips sit between the
 * sidebars (right of left, left of right).
 */
export const decorationRegions = (
  viewport: Viewport,
  chrome: Chrome,
): DecorationRegions => {
  const left = chrome.leftCols ?? 0;
  const right = chrome.rightCols ?? 0;
  const top = chrome.topRows ?? 0;
  const bottom = chrome.bottomRows ?? 0;

  const bandY = chrome.tabBarRows + 1; // first content row, 1-based
  const bandH = Math.max(
    0,
    viewport.rows - chrome.tabBarRows - chrome.statusBarRows,
  );
  const innerX = left + 1; // first column right of the left sidebar
  const innerW = Math.max(0, viewport.cols - left - right);

  const regions: {
    left?: Region;
    right?: Region;
    top?: Region;
    bottom?: Region;
  } = {};

  if (left > 0) regions.left = { x: 1, y: bandY, width: left, height: bandH };
  if (right > 0) {
    regions.right = {
      x: viewport.cols - right + 1,
      y: bandY,
      width: right,
      height: bandH,
    };
  }
  if (top > 0) {
    regions.top = { x: innerX, y: bandY, width: innerW, height: top };
  }
  if (bottom > 0) {
    regions.bottom = {
      x: innerX,
      y: viewport.rows - chrome.statusBarRows - bottom + 1,
      width: innerW,
      height: bottom,
    };
  }

  return regions;
};

const RATIO_SCALE = 100;

const splitToFlex = (node: SplitNode): tui.layoutTypes.FlexNode => {
  if (node.kind === "leaf") {
    return { id: node.pane, size: { type: "flex", grow: 1 } };
  }

  const direction = node.direction === "vertical" ? "row" : "column";
  const firstGrow = Math.max(1, Math.round(node.ratio * RATIO_SCALE));
  const secondGrow = Math.max(1, Math.round((1 - node.ratio) * RATIO_SCALE));

  return {
    direction,
    size: { type: "flex", grow: 1 },
    children: [
      { ...splitToFlex(node.first), size: { type: "flex", grow: firstGrow } },
      { ...splitToFlex(node.second), size: { type: "flex", grow: secondGrow } },
    ],
  };
};

/**
 * Compute absolute geometry for every pane in a tab.
 *
 * When a pane is fullscreen, only it is returned, filling the whole content area.
 */
export const computeTabGeoms = (
  tab: Tab,
  viewport: Viewport,
  chrome: Chrome,
): Map<PaneId, Geom> => {
  const left = chrome.leftCols ?? 0;
  const right = chrome.rightCols ?? 0;
  const top = chrome.topRows ?? 0;
  const bottom = chrome.bottomRows ?? 0;

  const xOffset = left;
  const yOffset = chrome.tabBarRows + top;
  const cols = Math.max(0, viewport.cols - left - right);
  const contentRows = Math.max(
    0,
    viewport.rows - chrome.tabBarRows - chrome.statusBarRows - top - bottom,
  );
  const result = new Map<PaneId, Geom>();

  if (tab.fullscreenPane !== undefined) {
    result.set(tab.fullscreenPane, {
      x: xOffset,
      y: yOffset,
      width: cols,
      height: contentRows,
    });

    return result;
  }

  const panels = tui.flexLayout.computeLayout(
    splitToFlex(tab.root),
    cols,
    contentRows,
  );

  for (const p of panels) {
    if (p.id === undefined) continue;
    result.set(p.id, {
      x: p.x + xOffset,
      y: p.y + yOffset,
      width: p.width,
      height: p.height,
    });
  }

  return result;
};

/**
 * Pick the pane spatially adjacent to `from` in `direction`, using computed
 * geoms. Returns null when there is no neighbour that way.
 */
export const neighborInDirection = (
  geoms: Map<PaneId, Geom>,
  from: PaneId,
  direction: "up" | "down" | "left" | "right",
): PaneId | null => {
  const self = geoms.get(from);
  if (self === undefined) return null;

  const horizontal = direction === "left" || direction === "right";
  const selfCx = self.x + self.width / 2;
  const selfCy = self.y + self.height / 2;

  let best: PaneId | null = null;
  let bestDist = Infinity;

  for (const [id, g] of geoms) {
    if (id === from) continue;

    // Require overlap on the perpendicular axis so focus never jumps diagonally
    // to a non-adjacent pane.
    const overlaps = horizontal
      ? g.y < self.y + self.height && g.y + g.height > self.y
      : g.x < self.x + self.width && g.x + g.width > self.x;
    if (!overlaps) continue;

    const center = horizontal ? g.x + g.width / 2 : g.y + g.height / 2;
    const selfCenter = horizontal ? selfCx : selfCy;

    const onSide = direction === "left" || direction === "up"
      ? center < selfCenter
      : center > selfCenter;
    if (!onSide) continue;

    const dist = Math.abs(center - selfCenter);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }

  return best;
};
