// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Generic scrollable container widget.
 *
 * Provides pure functions for managing scroll state, reducing scroll
 * actions, ensuring visibility of specific indices, computing visible
 * ranges, and rendering a vertical scrollbar inside a panel.
 *
 * @module
 */

import * as ansi from "./ansi.ts";
import * as layoutTypes from "./layout-types.ts";

/** Create an initial scroll state with offset at 0. */
export const createScrollState = (
  contentHeight: number,
  viewportHeight: number,
): layoutTypes.ScrollState => ({
  offset: 0,
  contentHeight,
  viewportHeight,
});

/** Compute the maximum valid offset for the given state dimensions. */
const maxOffset = (state: layoutTypes.ScrollState): number =>
  Math.max(0, state.contentHeight - state.viewportHeight);

/** Clamp a value between a minimum and maximum (inclusive). */
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Pure reducer that applies a scroll action to the current state and
 * returns a new state with the offset clamped to valid bounds.
 */
export const scrollReducer = (
  state: layoutTypes.ScrollState,
  action: layoutTypes.ScrollAction,
): layoutTypes.ScrollState => {
  const max = maxOffset(state);

  const nextOffset = (() => {
    switch (action) {
      case "up":
        return state.offset - 1;
      case "down":
        return state.offset + 1;
      case "pageUp":
        return state.offset - state.viewportHeight;
      case "pageDown":
        return state.offset + state.viewportHeight;
      case "home":
        return 0;
      case "end":
        return max;
    }
  })();

  return {
    ...state,
    offset: clamp(nextOffset, 0, max),
  };
};

/**
 * Adjust the scroll offset so that the row at `index` is visible within
 * the viewport. Returns the state unchanged if the index is already visible.
 */
export const ensureVisible = (
  state: layoutTypes.ScrollState,
  index: number,
): layoutTypes.ScrollState => {
  if (index < state.offset) {
    return { ...state, offset: index };
  }

  if (index >= state.offset + state.viewportHeight) {
    return { ...state, offset: index - state.viewportHeight + 1 };
  }

  return state;
};

/**
 * Render a vertical scrollbar in the rightmost column of the given panel.
 *
 * The thumb size is proportional to the viewport/content ratio.
 * Returns an ANSI string that can be appended to terminal output.
 */
export const renderScrollbar = (
  panel: layoutTypes.ComputedPanel,
  state: layoutTypes.ScrollState,
  style: "block" | "line" = "block",
): string => {
  const { height } = panel;

  // Nothing to scroll — no scrollbar needed
  if (state.contentHeight <= state.viewportHeight) {
    return "";
  }

  const thumbChar = style === "block" ? "\u2588" : "\u2503";
  const trackChar = "\u2502";

  // Scrollbar column is the rightmost column of the panel (1-based)
  const col = panel.x + panel.width;

  // Thumb size proportional to viewport/content, minimum 1 cell
  const thumbSize = Math.max(
    1,
    Math.round((state.viewportHeight / state.contentHeight) * height),
  );

  // Thumb position proportional to offset within scrollable range
  const max = maxOffset(state);
  const thumbTop = max > 0
    ? Math.round((state.offset / max) * (height - thumbSize))
    : 0;

  const parts: string[] = [];

  for (let i = 0; i < height; i++) {
    const row = panel.y + i + 1; // 1-based row
    const isThumb = i >= thumbTop && i < thumbTop + thumbSize;

    if (isThumb) {
      parts.push(ansi.moveTo(row, col) + thumbChar);
    } else {
      parts.push(ansi.moveTo(row, col) + ansi.dim(trackChar));
    }
  }

  return parts.join("");
};

/**
 * Return the range of visible content indices for the current scroll state.
 * `start` is inclusive, `end` is exclusive.
 */
export const visibleRange = (
  state: layoutTypes.ScrollState,
): { start: number; end: number } => ({
  start: state.offset,
  end: Math.min(state.offset + state.viewportHeight, state.contentHeight),
});
