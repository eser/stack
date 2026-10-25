// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as reducer from "../engine/reducer.ts";
import * as splitTree from "../engine/split-tree.ts";
import type { MuxState } from "../engine/types.ts";
import * as scene from "./scene.ts";
import * as diff from "./diff.ts";

const twoPanes = (): MuxState => {
  let s = reducer.reduce(reducer.createInitialState({ cols: 80, rows: 24 }), {
    type: "newTab",
  })
    .state;
  s = reducer.reduce(s, { type: "splitPane", direction: "vertical" }).state;

  return s;
};

Deno.test("deriveScene exposes panes with geometry and focus", () => {
  const s = twoPanes();
  const derived = scene.deriveScene(s);
  const [a, b] = splitTree.collectLeaves(s.tabs[0]!.root);

  assert.assertEquals(derived.panes.length, 2);
  assert.assertEquals(derived.focusedPane, b);
  assert.assertEquals(derived.panes.find((p) => p.id === a)?.focused, false);
  assert.assertEquals(derived.panes.find((p) => p.id === b)?.focused, true);

  // side-by-side split: the two panes share the row, left one starts at x=0
  const left = derived.panes.find((p) => p.id === a)!;
  const right = derived.panes.find((p) => p.id === b)!;
  assert.assertEquals(left.geom.x, 0);
  assert.assertEquals(right.geom.x > left.geom.x, true);
  // both below the tab bar (y >= 1)
  assert.assertEquals(left.geom.y >= 1, true);
});

Deno.test("deriveScene of a fullscreen pane returns only that pane", () => {
  let s = twoPanes();
  s = reducer.reduce(s, { type: "toggleFullscreen" }).state;
  const derived = scene.deriveScene(s);

  assert.assertEquals(derived.panes.length, 1);
  assert.assertEquals(derived.panes[0]!.id, s.tabs[0]!.fullscreenPane);
});

Deno.test("diffScene returns a full delta for a null previous scene", () => {
  const derived = scene.deriveScene(twoPanes());
  const delta = diff.diffScene(null, derived);

  assert.assertEquals(delta?.panes?.length, 2);
  assert.assertEquals(delta?.tabs?.length, 1);
});

Deno.test("diffScene returns null when nothing changed", () => {
  const derived = scene.deriveScene(twoPanes());
  assert.assertEquals(diff.diffScene(derived, derived), null);
});

Deno.test("diffScene reports only the changed fields", () => {
  const s = twoPanes();
  const prev = scene.deriveScene(s);
  const next = scene.deriveScene(
    reducer.reduce(s, { type: "switchMode", mode: "pane" }).state,
  );

  const delta = diff.diffScene(prev, next);
  assert.assertEquals(delta, { mode: "pane" });
});
