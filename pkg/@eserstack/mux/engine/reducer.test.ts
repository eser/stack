// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { createInitialState, reduce } from "./reducer.ts";
import * as tree from "./split-tree.ts";
import type { MuxState } from "./types.ts";

const base = (): MuxState =>
  reduce(createInitialState({ cols: 80, rows: 24 }), { type: "newTab" }).state;

Deno.test("newTab opens a tab with one pane and asks to spawn it", () => {
  const r = reduce(createInitialState({ cols: 80, rows: 24 }), {
    type: "newTab",
  });

  assertEquals(r.state.tabs.length, 1);
  const tab = r.state.tabs[0]!;
  assertEquals(tree.collectLeaves(tab.root).length, 1);
  assertEquals(tab.focusedPane, tab.root.kind === "leaf" ? tab.root.pane : "");
  assertEquals(r.effects.some((e) => e.type === "spawnPty"), true);
});

Deno.test("splitPane adds a pane, focuses it, and emits spawn", () => {
  const s0 = base();
  const r = reduce(s0, { type: "splitPane", direction: "vertical" });
  const tab = r.state.tabs[0]!;

  assertEquals(tree.collectLeaves(tab.root).length, 2);
  assertEquals(tab.focusedPane, tree.collectLeaves(tab.root)[1]);
  assertEquals(r.effects.filter((e) => e.type === "spawnPty").length, 1);
});

Deno.test("closeFocusedPane removes the pane and kills its process", () => {
  let s = base();
  s = reduce(s, { type: "splitPane", direction: "vertical" }).state;
  const closed = s.tabs[0]!.focusedPane;

  const r = reduce(s, { type: "closeFocusedPane" });
  const tab = r.state.tabs[0]!;

  assertEquals(tree.collectLeaves(tab.root).length, 1);
  assertEquals(Object.keys(r.state.panes).length, 1);
  assertEquals(
    r.effects.some((e) => e.type === "killPty" && e.pane === closed),
    true,
  );
});

Deno.test("closeFocusedPane on the last pane closes the tab and exits", () => {
  const s = base();
  const r = reduce(s, { type: "closeFocusedPane" });

  assertEquals(r.state.tabs.length, 0);
  assertEquals(r.state.running, false);
  assertEquals(r.effects.some((e) => e.type === "exit"), true);
});

Deno.test("focusNext cycles through panes", () => {
  let s = base();
  s = reduce(s, { type: "splitPane", direction: "vertical" }).state;
  const leaves = tree.collectLeaves(s.tabs[0]!.root);

  // currently focused on the second (just-split) pane
  assertEquals(s.tabs[0]!.focusedPane, leaves[1]);
  s = reduce(s, { type: "focusNext" }).state;
  assertEquals(s.tabs[0]!.focusedPane, leaves[0]);
});

Deno.test("focusDirection moves to the spatial neighbour", () => {
  let s = base();
  // vertical split → a | b, focus on b (right pane)
  s = reduce(s, { type: "splitPane", direction: "vertical" }).state;
  const [a, b] = tree.collectLeaves(s.tabs[0]!.root);
  assertEquals(s.tabs[0]!.focusedPane, b);

  s = reduce(s, { type: "focusDirection", direction: "left" }).state;
  assertEquals(s.tabs[0]!.focusedPane, a);
});

Deno.test("toggleFullscreen sets and clears the fullscreen pane", () => {
  let s = base();
  const focused = s.tabs[0]!.focusedPane;
  s = reduce(s, { type: "toggleFullscreen" }).state;
  assertEquals(s.tabs[0]!.fullscreenPane, focused);
  s = reduce(s, { type: "toggleFullscreen" }).state;
  assertEquals(s.tabs[0]!.fullscreenPane, undefined);
});

Deno.test("writeInput targets the focused pane", () => {
  const s = base();
  const r = reduce(s, { type: "writeInput", data: "ls\r" });
  assertEquals(r.effects, [
    { type: "writePty", pane: s.tabs[0]!.focusedPane, data: "ls\r" },
  ]);
});

Deno.test("writeToPane targets a specific pane regardless of focus", () => {
  let s = base();
  s = reduce(s, { type: "splitPane", direction: "vertical" }).state;
  const [a, b] = tree.collectLeaves(s.tabs[0]!.root);
  assertEquals(s.tabs[0]!.focusedPane, b); // focus is on b

  const r = reduce(s, { type: "writeToPane", pane: a!, data: "hi\r" });
  assertEquals(r.effects, [{ type: "writePty", pane: a!, data: "hi\r" }]);
});

Deno.test("writeToPane ignores an unknown pane", () => {
  const s = base();
  const r = reduce(s, {
    type: "writeToPane",
    pane: "pane-does-not-exist",
    data: "x",
  });
  assertEquals(r.effects, []);
});

Deno.test("paneExited removes a non-focused pane without killing it", () => {
  let s = base();
  s = reduce(s, { type: "splitPane", direction: "vertical" }).state;
  const [a, b] = tree.collectLeaves(s.tabs[0]!.root);

  const r = reduce(s, { type: "paneExited", pane: a!, code: 0 });
  const tab = r.state.tabs[0]!;

  assertEquals(tree.collectLeaves(tab.root), [b]);
  assertEquals(r.effects.some((e) => e.type === "killPty"), false);
  assertEquals(r.effects.some((e) => e.type === "render"), true);
});

Deno.test("resizeViewport updates the viewport", () => {
  const s = base();
  const r = reduce(s, { type: "resizeViewport", cols: 120, rows: 40 });
  assertEquals(r.state.viewport, { cols: 120, rows: 40 });
});

Deno.test("paneExited on a tab before the active one keeps the same tab visible", () => {
  let s = base(); // tab index 0
  s = reduce(s, { type: "newTab" }).state; // index 1
  s = reduce(s, { type: "newTab" }).state; // index 2
  s = reduce(s, { type: "gotoTab", index: 1 }).state; // viewing index 1
  const viewedTabId = s.tabs[1]!.id;

  const tab0Pane = tree.collectLeaves(s.tabs[0]!.root)[0]!;
  s = reduce(s, { type: "paneExited", pane: tab0Pane, code: 0 }).state;

  assertEquals(s.tabs.length, 2);
  assertEquals(s.tabs[s.activeTab]!.id, viewedTabId); // not shifted to a neighbour
});

Deno.test("closeTab with a lower index keeps the same tab visible", () => {
  let s = base(); // index 0
  s = reduce(s, { type: "newTab" }).state; // index 1
  s = reduce(s, { type: "newTab" }).state; // index 2, active = 2
  const viewedId = s.tabs[2]!.id;

  const r = reduce(s, { type: "closeTab", index: 0 });
  assertEquals(r.state.tabs.length, 2);
  assertEquals(r.state.tabs[r.state.activeTab]!.id, viewedId); // not yanked
  assertEquals(r.effects.some((e) => e.type === "killPty"), true);
});

Deno.test("closeTab without an index closes the active tab", () => {
  let s = base();
  s = reduce(s, { type: "newTab" }).state; // active = 1
  const r = reduce(s, { type: "closeTab" });
  assertEquals(r.state.tabs.length, 1);
});

Deno.test("nextTab/prevTab wrap around", () => {
  let s = base();
  s = reduce(s, { type: "newTab" }).state; // 2 tabs, active = 1
  assertEquals(s.activeTab, 1);
  s = reduce(s, { type: "nextTab" }).state;
  assertEquals(s.activeTab, 0);
  s = reduce(s, { type: "prevTab" }).state;
  assertEquals(s.activeTab, 1);
});
