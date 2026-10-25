// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as geometry from "./geometry.ts";
import * as splitTree from "./split-tree.ts";
import type { Geom, PaneId, Tab } from "./types.ts";

const layout = (): Map<PaneId, Geom> =>
  new Map([
    ["a", { x: 0, y: 0, width: 40, height: 12 }], // top-left
    ["b", { x: 40, y: 0, width: 40, height: 12 }], // top-right
    ["c", { x: 0, y: 12, width: 80, height: 12 }], // bottom, full width
  ]);

Deno.test("neighborInDirection moves to the adjacent pane that overlaps", () => {
  const g = layout();
  assert.assertEquals(geometry.neighborInDirection(g, "a", "right"), "b");
  assert.assertEquals(geometry.neighborInDirection(g, "b", "left"), "a");
  assert.assertEquals(geometry.neighborInDirection(g, "a", "down"), "c");
  assert.assertEquals(geometry.neighborInDirection(g, "c", "up"), "a"); // a is closest above c's left half
});

Deno.test("neighborInDirection returns null when there is no neighbour", () => {
  const g = layout();
  assert.assertEquals(geometry.neighborInDirection(g, "a", "left"), null);
  assert.assertEquals(geometry.neighborInDirection(g, "a", "up"), null);
});

Deno.test("chrome reserved regions offset and shrink the pane area", () => {
  const tab: Tab = {
    id: "t",
    name: "t",
    root: splitTree.leaf("p"),
    focusedPane: "p",
  };
  const chrome = { tabBarRows: 1, statusBarRows: 1, leftCols: 20, topRows: 5 };
  const geom = geometry.computeTabGeoms(tab, { cols: 100, rows: 30 }, chrome)
    .get("p")!;

  // x past the sidebar, y past tab bar + monitor strip; size reduced by both.
  assert.assertEquals(geom, { x: 20, y: 6, width: 80, height: 23 });
});

Deno.test("decorationRegions yields 1-based sidebar and top-strip rects", () => {
  const r = geometry.decorationRegions({ cols: 100, rows: 30 }, {
    tabBarRows: 1,
    statusBarRows: 1,
    leftCols: 20,
    topRows: 5,
  });

  assert.assertEquals(r.left, { x: 1, y: 2, width: 20, height: 28 });
  assert.assertEquals(r.top, { x: 21, y: 2, width: 80, height: 5 });
  assert.assertEquals(r.right, undefined);
});

Deno.test("effectiveChrome drops decorations that would starve the pane area", () => {
  const chrome = { tabBarRows: 1, statusBarRows: 1, leftCols: 30, topRows: 8 };

  // Roomy viewport: reservations kept.
  assert.assertEquals(
    geometry.effectiveChrome({ cols: 100, rows: 30 }, chrome).leftCols,
    30,
  );
  assert.assertEquals(
    geometry.effectiveChrome({ cols: 100, rows: 30 }, chrome).topRows,
    8,
  );

  // Too narrow: the sidebar is dropped so panes still get width.
  assert.assertEquals(
    geometry.effectiveChrome({ cols: 35, rows: 30 }, chrome).leftCols,
    0,
  );

  // Too short: the monitor strip is dropped so panes still get height.
  assert.assertEquals(
    geometry.effectiveChrome({ cols: 100, rows: 9 }, chrome).topRows,
    0,
  );
});

Deno.test("neighborInDirection does not jump diagonally", () => {
  // a (top-left) pressing down must not select b (top-right, no x overlap with... )
  // Construct a case where a diagonal pane is closer by blended distance but
  // has no perpendicular overlap, so it must be rejected.
  const g = new Map<PaneId, Geom>([
    ["a", { x: 0, y: 0, width: 20, height: 10 }],
    ["diag", { x: 40, y: 10, width: 20, height: 10 }], // below-right, no x overlap with a
  ]);
  assert.assertEquals(geometry.neighborInDirection(g, "a", "down"), null);
});
