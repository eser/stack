// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import * as tree from "./split-tree.ts";
import type { SplitNode } from "./types.ts";

Deno.test("collectLeaves returns panes in order", () => {
  const root: SplitNode = {
    kind: "branch",
    direction: "vertical",
    ratio: 0.5,
    first: tree.leaf("a"),
    second: {
      kind: "branch",
      direction: "horizontal",
      ratio: 0.5,
      first: tree.leaf("b"),
      second: tree.leaf("c"),
    },
  };

  assertEquals(tree.collectLeaves(root), ["a", "b", "c"]);
});

Deno.test("splitLeaf replaces the target with a branch", () => {
  const root = tree.leaf("a");
  const next = tree.splitLeaf(root, "a", "vertical", "b");

  assertEquals(next, {
    kind: "branch",
    direction: "vertical",
    first: { kind: "leaf", pane: "a" },
    second: { kind: "leaf", pane: "b" },
    ratio: 0.5,
  });
});

Deno.test("splitLeaf on a missing target is a no-op", () => {
  const root = tree.leaf("a");
  assertEquals(tree.splitLeaf(root, "z", "vertical", "b"), root);
});

Deno.test("splitLeaf descends into nested branches", () => {
  const root = tree.splitLeaf(tree.leaf("a"), "a", "vertical", "b");
  const next = tree.splitLeaf(root, "b", "horizontal", "c");
  assertEquals(tree.collectLeaves(next), ["a", "b", "c"]);
});

Deno.test("removeLeaf collapses the branch to its sibling", () => {
  const root = tree.splitLeaf(tree.leaf("a"), "a", "vertical", "b");
  const { root: next, promoted } = tree.removeLeaf(root, "b");

  assertEquals(next, tree.leaf("a"));
  assertEquals(promoted, "a");
});

Deno.test("removeLeaf of a nested leaf promotes the sibling subtree", () => {
  let root = tree.splitLeaf(tree.leaf("a"), "a", "vertical", "b");
  root = tree.splitLeaf(root, "b", "horizontal", "c"); // a | (b / c)
  const { root: next, promoted } = tree.removeLeaf(root, "b");

  assertEquals(next === null ? [] : tree.collectLeaves(next), ["a", "c"]);
  assertEquals(promoted, "c");
});

Deno.test("removeLeaf of the only pane empties the tree", () => {
  assertEquals(tree.removeLeaf(tree.leaf("a"), "a"), {
    root: null,
    promoted: null,
  });
});

Deno.test("resizeFocused grows the focused pane in a matching branch", () => {
  const root: SplitNode = {
    kind: "branch",
    direction: "vertical",
    ratio: 0.5,
    first: tree.leaf("a"),
    second: tree.leaf("b"),
  };

  const grown = tree.resizeFocused(root, "a", "right", 0.1);
  assertEquals(grown.kind === "branch" ? grown.ratio : -1, 0.6);

  const shrunk = tree.resizeFocused(root, "a", "left", 0.1);
  assertEquals(shrunk.kind === "branch" ? shrunk.ratio : -1, 0.4);
});

Deno.test("resizeFocused ignores a perpendicular direction", () => {
  const root: SplitNode = {
    kind: "branch",
    direction: "vertical",
    ratio: 0.5,
    first: tree.leaf("a"),
    second: tree.leaf("b"),
  };

  // up/down don't match a vertical (row) branch
  assertEquals(tree.resizeFocused(root, "a", "up", 0.1), root);
});

Deno.test("resizeFocused clamps to the usable range", () => {
  const root: SplitNode = {
    kind: "branch",
    direction: "vertical",
    ratio: 0.88,
    first: tree.leaf("a"),
    second: tree.leaf("b"),
  };

  const grown = tree.resizeFocused(root, "a", "right", 0.1);
  assertEquals(grown.kind === "branch" ? grown.ratio : -1, 0.9);
});
