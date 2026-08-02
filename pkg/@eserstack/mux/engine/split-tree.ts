// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Pure operations over the binary split tree ({@link SplitNode}).
 *
 * Every function is immutable: it returns a new tree (or leaf list) and never
 * mutates its input. These are the building blocks the reducer composes.
 *
 * @module
 */

import type { Direction, PaneId, SplitDirection, SplitNode } from "./types.ts";

const MIN_RATIO = 0.1;
const MAX_RATIO = 0.9;

const clampRatio = (r: number): number =>
  r < MIN_RATIO ? MIN_RATIO : r > MAX_RATIO ? MAX_RATIO : r;

/** Construct a leaf node. */
export const leaf = (pane: PaneId): SplitNode => ({ kind: "leaf", pane });

/** All pane ids in left-to-right, depth-first order. */
export const collectLeaves = (node: SplitNode): PaneId[] => {
  if (node.kind === "leaf") return [node.pane];

  return [...collectLeaves(node.first), ...collectLeaves(node.second)];
};

/** Whether `pane` appears anywhere in the tree. */
export const hasLeaf = (node: SplitNode, pane: PaneId): boolean => {
  if (node.kind === "leaf") return node.pane === pane;

  return hasLeaf(node.first, pane) || hasLeaf(node.second, pane);
};

/** The first (left/top-most) pane id in the tree. */
export const firstLeaf = (node: SplitNode): PaneId => {
  let cur = node;
  while (cur.kind === "branch") cur = cur.first;

  return cur.pane;
};

/**
 * Replace the leaf for `target` with a branch splitting it and `newPane`.
 * Returns the tree unchanged if `target` is not present.
 */
export const splitLeaf = (
  node: SplitNode,
  target: PaneId,
  direction: SplitDirection,
  newPane: PaneId,
  ratio = 0.5,
): SplitNode => {
  if (node.kind === "leaf") {
    if (node.pane !== target) return node;

    return {
      kind: "branch",
      direction,
      first: node,
      second: leaf(newPane),
      ratio: clampRatio(ratio),
    };
  }

  if (hasLeaf(node.first, target)) {
    return {
      ...node,
      first: splitLeaf(node.first, target, direction, newPane, ratio),
    };
  }

  if (hasLeaf(node.second, target)) {
    return {
      ...node,
      second: splitLeaf(node.second, target, direction, newPane, ratio),
    };
  }

  return node;
};

/** Result of removing a leaf: the new tree (null if it emptied) and the pane to focus next. */
export type RemoveResult = {
  readonly root: SplitNode | null;
  readonly promoted: PaneId | null;
};

/**
 * Remove the leaf for `target`. The containing branch collapses to its sibling,
 * and `promoted` is the sibling's first leaf so the caller can move focus there.
 */
export const removeLeaf = (node: SplitNode, target: PaneId): RemoveResult => {
  if (node.kind === "leaf") {
    return node.pane === target
      ? { root: null, promoted: null }
      : { root: node, promoted: null };
  }

  if (node.first.kind === "leaf" && node.first.pane === target) {
    return { root: node.second, promoted: firstLeaf(node.second) };
  }

  if (node.second.kind === "leaf" && node.second.pane === target) {
    return { root: node.first, promoted: firstLeaf(node.first) };
  }

  if (hasLeaf(node.first, target)) {
    const r = removeLeaf(node.first, target);
    if (r.root === null) {
      return { root: node.second, promoted: firstLeaf(node.second) };
    }

    return { root: { ...node, first: r.root }, promoted: r.promoted };
  }

  if (hasLeaf(node.second, target)) {
    const r = removeLeaf(node.second, target);
    if (r.root === null) {
      return { root: node.first, promoted: firstLeaf(node.first) };
    }

    return { root: { ...node, second: r.root }, promoted: r.promoted };
  }

  return { root: node, promoted: null };
};

/**
 * Grow/shrink the focused pane by adjusting the nearest enclosing branch whose
 * axis matches `direction`. `delta` is a ratio fraction (e.g. 0.05).
 *
 * The sign depends only on the direction (not which side the pane is on): for a
 * vertical branch `right` grows `first`, `left` shrinks it; for a horizontal
 * branch `down` grows `first`, `up` shrinks it.
 */
export const resizeFocused = (
  node: SplitNode,
  target: PaneId,
  direction: Direction,
  delta: number,
): SplitNode => {
  if (node.kind === "leaf") return node;

  const childKey = hasLeaf(node.first, target)
    ? "first"
    : hasLeaf(node.second, target)
    ? "second"
    : null;
  if (childKey === null) return node;

  // Prefer the deepest matching branch: recurse first.
  const child = node[childKey];
  const adjustedChild = resizeFocused(child, target, direction, delta);
  if (adjustedChild !== child) {
    return { ...node, [childKey]: adjustedChild };
  }

  const axis: SplitDirection = direction === "left" || direction === "right"
    ? "vertical"
    : "horizontal";
  if (node.direction !== axis) return node;

  const sign = direction === "right" || direction === "down" ? 1 : -1;

  return { ...node, ratio: clampRatio(node.ratio + sign * delta) };
};
