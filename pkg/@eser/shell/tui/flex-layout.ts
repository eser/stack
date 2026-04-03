// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Pure-function flex layout engine for terminal UI.
 *
 * Takes a {@link FlexNode} tree and available terminal dimensions,
 * then returns a flat array of {@link ComputedPanel} with absolute
 * coordinates for every node that carries an `id`.
 *
 * No classes, no mutation, no external dependencies.
 *
 * @module
 */

import * as layoutTypes from "./layout-types.ts";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_DIRECTION: layoutTypes.FlexDirection = "column";
const DEFAULT_SIZE: layoutTypes.FlexSize = { type: "flex", grow: 1 };
const DEFAULT_GAP = 0;
const DEFAULT_SHRINK = 1;

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const clampMin = (value: number, min: number): number =>
  value < min ? min : value;

const resolveDirection = (
  node: layoutTypes.FlexNode,
): layoutTypes.FlexDirection => node.direction ?? DEFAULT_DIRECTION;

const resolveSize = (node: layoutTypes.FlexNode): layoutTypes.FlexSize =>
  node.size ?? DEFAULT_SIZE;

const resolveGap = (node: layoutTypes.FlexNode): number =>
  node.gap ?? DEFAULT_GAP;

const innerRect = (
  rect: Rect,
  padding: layoutTypes.FlexNode["padding"],
): Rect => {
  const top = padding?.top ?? 0;
  const right = padding?.right ?? 0;
  const bottom = padding?.bottom ?? 0;
  const left = padding?.left ?? 0;

  return {
    x: rect.x + left,
    y: rect.y + top,
    width: clampMin(rect.width - left - right, 0),
    height: clampMin(rect.height - top - bottom, 0),
  };
};

// ---------------------------------------------------------------------------
// Core recursive layout
// ---------------------------------------------------------------------------

const layoutNode = (
  node: layoutTypes.FlexNode,
  rect: Rect,
): ReadonlyArray<layoutTypes.ComputedPanel> => {
  const children = node.children ?? [];

  // Leaf node — return own panel if it has an id, otherwise nothing.
  if (children.length === 0) {
    if (node.id !== undefined) {
      return [
        {
          id: node.id,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      ];
    }
    return [];
  }

  const panels: Array<layoutTypes.ComputedPanel> = [];

  // Include own panel if it has an id.
  if (node.id !== undefined) {
    panels.push({
      id: node.id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }

  const direction = resolveDirection(node);
  const gap = resolveGap(node);
  const inner = innerRect(rect, node.padding);

  const isRow = direction === "row";
  const mainAxis = isRow ? inner.width : inner.height;
  const crossAxis = isRow ? inner.height : inner.width;
  const totalGap = children.length > 1 ? gap * (children.length - 1) : 0;
  const availableMain = clampMin(mainAxis - totalGap, 0);

  // --- First pass: allocate fixed and percent; collect flex nodes ----------
  type ChildAlloc = {
    readonly index: number;
    readonly node: layoutTypes.FlexNode;
    readonly size: layoutTypes.FlexSize;
    mainSize: number;
    isFlex: boolean;
    grow: number;
    shrink: number;
  };

  const allocs: Array<ChildAlloc> = [];
  let usedByNonFlex = 0;

  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    const size = resolveSize(child);

    const alloc: ChildAlloc = {
      index: i,
      node: child,
      size,
      mainSize: 0,
      isFlex: false,
      grow: 0,
      shrink: DEFAULT_SHRINK,
    };

    if (size.type === "fixed") {
      alloc.mainSize = clampMin(size.value, 0);
      usedByNonFlex += alloc.mainSize;
    } else if (size.type === "percent") {
      alloc.mainSize = Math.floor(availableMain * (size.value / 100));
      usedByNonFlex += alloc.mainSize;
    } else {
      // flex
      alloc.isFlex = true;
      alloc.grow = size.grow;
      alloc.shrink = size.shrink ?? DEFAULT_SHRINK;
    }

    allocs.push(alloc);
  }

  // --- Second pass: distribute remaining space among flex children ---------
  const remaining = clampMin(availableMain - usedByNonFlex, 0);
  const flexChildren = allocs.filter((a) => a.isFlex);
  const totalGrow = flexChildren.reduce((sum, a) => sum + a.grow, 0);

  if (totalGrow > 0 && remaining > 0) {
    let distributed = 0;
    for (let i = 0; i < flexChildren.length; i++) {
      const fc = flexChildren[i]!;
      if (i === flexChildren.length - 1) {
        // Last flex child gets the remainder to avoid rounding gaps.
        fc.mainSize = remaining - distributed;
      } else {
        fc.mainSize = Math.floor(remaining * (fc.grow / totalGrow));
        distributed += fc.mainSize;
      }
    }
  }

  // --- Third pass: shrink if overflow --------------------------------------
  const totalAllocated = allocs.reduce((sum, a) => sum + a.mainSize, 0);
  const overflow = totalAllocated - availableMain;

  if (overflow > 0) {
    const shrinkableChildren = allocs.filter(
      (a) => a.isFlex && a.shrink > 0,
    );
    const totalShrink = shrinkableChildren.reduce(
      (sum, a) => sum + a.shrink,
      0,
    );

    if (totalShrink > 0) {
      let shrunk = 0;
      for (let i = 0; i < shrinkableChildren.length; i++) {
        const sc = shrinkableChildren[i]!;
        if (i === shrinkableChildren.length - 1) {
          const reduction = overflow - shrunk;
          sc.mainSize = clampMin(sc.mainSize - reduction, 0);
        } else {
          const reduction = Math.floor(overflow * (sc.shrink / totalShrink));
          sc.mainSize = clampMin(sc.mainSize - reduction, 0);
          shrunk += reduction;
        }
      }
    }
  }

  // --- Fourth pass: position children along the main axis ------------------
  let offset = isRow ? inner.x : inner.y;

  for (let i = 0; i < allocs.length; i++) {
    const alloc = allocs[i]!;
    const childRect: Rect = isRow
      ? {
        x: offset,
        y: inner.y,
        width: alloc.mainSize,
        height: crossAxis,
      }
      : {
        x: inner.x,
        y: offset,
        width: crossAxis,
        height: alloc.mainSize,
      };

    // Recurse into child.
    const childPanels = layoutNode(alloc.node, childRect);
    for (const p of childPanels) {
      panels.push(p);
    }

    offset += alloc.mainSize;
    if (i < allocs.length - 1) {
      offset += gap;
    }
  }

  return panels;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute absolute-coordinate panels for every node in a {@link FlexNode}
 * tree that carries an `id`.
 *
 * @param root  - The root of the layout tree.
 * @param width - Available terminal columns.
 * @param height - Available terminal rows.
 * @returns Flat array of {@link ComputedPanel} with absolute positions.
 */
export const computeLayout = (
  root: layoutTypes.FlexNode,
  width: number,
  height: number,
): ReadonlyArray<layoutTypes.ComputedPanel> => {
  return layoutNode(root, { x: 0, y: 0, width, height });
};

/**
 * Look up a single panel by its `id`.
 *
 * @param panels - Array returned by {@link computeLayout}.
 * @param id     - The stable identifier to search for.
 * @returns The matching panel, or `undefined` if not found.
 */
export const findPanel = (
  panels: ReadonlyArray<layoutTypes.ComputedPanel>,
  id: string,
): layoutTypes.ComputedPanel | undefined => {
  return panels.find((p) => p.id === id);
};

/**
 * Convenience factory that creates a {@link FlexNode} with sensible defaults.
 *
 * Defaults: direction "column", size flex grow 1, gap 0, no padding.
 *
 * @param overrides - Partial properties to merge over the defaults.
 * @returns A complete {@link FlexNode}.
 */
export const createFlexNode = (
  overrides?: Partial<layoutTypes.FlexNode>,
): layoutTypes.FlexNode => {
  return {
    direction: DEFAULT_DIRECTION,
    size: DEFAULT_SIZE,
    gap: DEFAULT_GAP,
    ...overrides,
  };
};
