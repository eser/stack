// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { createInitialState, reduce } from "../engine/reducer.ts";
import { collectLeaves } from "../engine/split-tree.ts";
import type { MuxState } from "../engine/types.ts";
import { deriveScene } from "./scene.ts";
import { diffScene } from "./diff.ts";

const twoPanes = (): MuxState => {
  let s = reduce(createInitialState({ cols: 80, rows: 24 }), { type: "newTab" })
    .state;
  s = reduce(s, { type: "splitPane", direction: "vertical" }).state;

  return s;
};

Deno.test("deriveScene exposes panes with geometry and focus", () => {
  const s = twoPanes();
  const scene = deriveScene(s);
  const [a, b] = collectLeaves(s.tabs[0]!.root);

  assertEquals(scene.panes.length, 2);
  assertEquals(scene.focusedPane, b);
  assertEquals(scene.panes.find((p) => p.id === a)?.focused, false);
  assertEquals(scene.panes.find((p) => p.id === b)?.focused, true);

  // side-by-side split: the two panes share the row, left one starts at x=0
  const left = scene.panes.find((p) => p.id === a)!;
  const right = scene.panes.find((p) => p.id === b)!;
  assertEquals(left.geom.x, 0);
  assertEquals(right.geom.x > left.geom.x, true);
  // both below the tab bar (y >= 1)
  assertEquals(left.geom.y >= 1, true);
});

Deno.test("deriveScene of a fullscreen pane returns only that pane", () => {
  let s = twoPanes();
  s = reduce(s, { type: "toggleFullscreen" }).state;
  const scene = deriveScene(s);

  assertEquals(scene.panes.length, 1);
  assertEquals(scene.panes[0]!.id, s.tabs[0]!.fullscreenPane);
});

Deno.test("diffScene returns a full delta for a null previous scene", () => {
  const scene = deriveScene(twoPanes());
  const delta = diffScene(null, scene);

  assertEquals(delta?.panes?.length, 2);
  assertEquals(delta?.tabs?.length, 1);
});

Deno.test("diffScene returns null when nothing changed", () => {
  const scene = deriveScene(twoPanes());
  assertEquals(diffScene(scene, scene), null);
});

Deno.test("diffScene reports only the changed fields", () => {
  const s = twoPanes();
  const prev = deriveScene(s);
  const next = deriveScene(
    reduce(s, { type: "switchMode", mode: "pane" }).state,
  );

  const delta = diffScene(prev, next);
  assertEquals(delta, { mode: "pane" });
});
