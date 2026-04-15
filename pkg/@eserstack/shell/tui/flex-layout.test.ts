// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as flexLayout from "./flex-layout.ts";

bdd.describe("computeLayout", () => {
  bdd.it(
    "should return empty array for node with no id and no children",
    () => {
      const result = flexLayout.computeLayout({}, 120, 40);
      assert.assertEquals(result, []);
    },
  );

  bdd.it("should return single panel for leaf node with id", () => {
    const result = flexLayout.computeLayout({ id: "main" }, 120, 40);
    assert.assertEquals(result, [
      { id: "main", x: 0, y: 0, width: 120, height: 40 },
    ]);
  });

  bdd.it("should split row direction with equal flex children", () => {
    const result = flexLayout.computeLayout(
      {
        direction: "row",
        children: [
          { id: "left", size: { type: "flex", grow: 1 } },
          { id: "right", size: { type: "flex", grow: 1 } },
        ],
      },
      120,
      40,
    );

    const left = flexLayout.findPanel(result, "left");
    const right = flexLayout.findPanel(result, "right");

    assert.assertNotEquals(left, undefined);
    assert.assertNotEquals(right, undefined);
    assert.assertEquals(left!.width, 60);
    assert.assertEquals(right!.width, 60);
    assert.assertEquals(left!.height, 40);
    assert.assertEquals(right!.height, 40);
    assert.assertEquals(left!.x, 0);
    assert.assertEquals(right!.x, 60);
  });

  bdd.it("should split row direction with unequal flex grow", () => {
    const result = flexLayout.computeLayout(
      {
        direction: "row",
        children: [
          { id: "left", size: { type: "flex", grow: 1 } },
          { id: "right", size: { type: "flex", grow: 2 } },
        ],
      },
      120,
      40,
    );

    const left = flexLayout.findPanel(result, "left");
    const right = flexLayout.findPanel(result, "right");

    assert.assertNotEquals(left, undefined);
    assert.assertNotEquals(right, undefined);
    assert.assertEquals(left!.width, 40);
    assert.assertEquals(right!.width, 80);
  });

  bdd.it("should split column direction", () => {
    const result = flexLayout.computeLayout(
      {
        direction: "column",
        children: [
          { id: "top", size: { type: "flex", grow: 1 } },
          { id: "bottom", size: { type: "flex", grow: 1 } },
        ],
      },
      120,
      40,
    );

    const top = flexLayout.findPanel(result, "top");
    const bottom = flexLayout.findPanel(result, "bottom");

    assert.assertNotEquals(top, undefined);
    assert.assertNotEquals(bottom, undefined);
    assert.assertEquals(top!.height, 20);
    assert.assertEquals(bottom!.height, 20);
    assert.assertEquals(top!.width, 120);
    assert.assertEquals(bottom!.width, 120);
  });

  bdd.it("should handle fixed size children", () => {
    const result = flexLayout.computeLayout(
      {
        direction: "row",
        children: [
          { id: "fixed", size: { type: "fixed", value: 30 } },
          { id: "flex", size: { type: "flex", grow: 1 } },
        ],
      },
      120,
      40,
    );

    const fixed = flexLayout.findPanel(result, "fixed");
    const flex = flexLayout.findPanel(result, "flex");

    assert.assertNotEquals(fixed, undefined);
    assert.assertNotEquals(flex, undefined);
    assert.assertEquals(fixed!.width, 30);
    assert.assertEquals(flex!.width, 90);
  });

  bdd.it("should handle percent size children", () => {
    const result = flexLayout.computeLayout(
      {
        direction: "row",
        children: [
          { id: "pct", size: { type: "percent", value: 25 } },
          { id: "flex", size: { type: "flex", grow: 1 } },
        ],
      },
      120,
      40,
    );

    const pct = flexLayout.findPanel(result, "pct");
    const flex = flexLayout.findPanel(result, "flex");

    assert.assertNotEquals(pct, undefined);
    assert.assertNotEquals(flex, undefined);
    assert.assertEquals(pct!.width, 30);
    assert.assertEquals(flex!.width, 90);
  });

  bdd.it("should apply gap between children", () => {
    const result = flexLayout.computeLayout(
      {
        direction: "row",
        gap: 2,
        children: [
          { id: "a", size: { type: "flex", grow: 1 } },
          { id: "b", size: { type: "flex", grow: 1 } },
        ],
      },
      120,
      40,
    );

    const a = flexLayout.findPanel(result, "a");
    const b = flexLayout.findPanel(result, "b");

    assert.assertNotEquals(a, undefined);
    assert.assertNotEquals(b, undefined);
    // Available after gap: 120 - 2 = 118, each gets 59
    assert.assertEquals(a!.width, 59);
    assert.assertEquals(b!.width, 59);
    // Second child x = 0 + 59 + 2 = 61
    assert.assertEquals(b!.x, 61);
  });

  bdd.it("should apply padding", () => {
    const result = flexLayout.computeLayout(
      {
        padding: { top: 1, right: 2, bottom: 1, left: 2 },
        children: [{ id: "child" }],
      },
      120,
      40,
    );

    const child = flexLayout.findPanel(result, "child");

    assert.assertNotEquals(child, undefined);
    assert.assertEquals(child!.x, 2);
    assert.assertEquals(child!.y, 1);
    assert.assertEquals(child!.width, 116);
    assert.assertEquals(child!.height, 38);
  });

  bdd.it("should handle nested layouts", () => {
    const result = flexLayout.computeLayout(
      {
        direction: "row",
        children: [
          { id: "left", size: { type: "flex", grow: 1 } },
          {
            size: { type: "flex", grow: 1 },
            direction: "column",
            children: [
              { id: "top-right", size: { type: "flex", grow: 1 } },
              { id: "bottom-right", size: { type: "flex", grow: 1 } },
            ],
          },
        ],
      },
      120,
      40,
    );

    const left = flexLayout.findPanel(result, "left");
    const topRight = flexLayout.findPanel(result, "top-right");
    const bottomRight = flexLayout.findPanel(result, "bottom-right");

    assert.assertNotEquals(left, undefined);
    assert.assertNotEquals(topRight, undefined);
    assert.assertNotEquals(bottomRight, undefined);

    assert.assertEquals(left!.x, 0);
    assert.assertEquals(left!.y, 0);
    assert.assertEquals(left!.width, 60);
    assert.assertEquals(left!.height, 40);

    assert.assertEquals(topRight!.x, 60);
    assert.assertEquals(topRight!.y, 0);
    assert.assertEquals(topRight!.width, 60);
    assert.assertEquals(topRight!.height, 20);

    assert.assertEquals(bottomRight!.x, 60);
    assert.assertEquals(bottomRight!.y, 20);
    assert.assertEquals(bottomRight!.width, 60);
    assert.assertEquals(bottomRight!.height, 20);
  });

  bdd.it("should handle single child getting all space", () => {
    const result = flexLayout.computeLayout(
      {
        direction: "row",
        children: [{ id: "only", size: { type: "flex", grow: 1 } }],
      },
      120,
      40,
    );

    const only = flexLayout.findPanel(result, "only");

    assert.assertNotEquals(only, undefined);
    assert.assertEquals(only!.width, 120);
    assert.assertEquals(only!.height, 40);
  });

  bdd.it("should clamp to zero when overflow", () => {
    const result = flexLayout.computeLayout(
      {
        direction: "row",
        children: [
          { id: "a", size: { type: "fixed", value: 80 } },
          { id: "b", size: { type: "fixed", value: 80 } },
          { id: "c", size: { type: "flex", grow: 1 } },
        ],
      },
      120,
      40,
    );

    const c = flexLayout.findPanel(result, "c");

    assert.assertNotEquals(c, undefined);
    assert.assertEquals(c!.width, 0);
  });

  bdd.it("should only return panels with ids", () => {
    const result = flexLayout.computeLayout(
      {
        direction: "row",
        children: [
          { id: "visible" },
          {
            direction: "column",
            children: [
              { id: "nested-visible" },
              {},
            ],
          },
        ],
      },
      120,
      40,
    );

    const ids = result.map((p) => p.id);
    assert.assertEquals(ids.includes("visible"), true);
    assert.assertEquals(ids.includes("nested-visible"), true);
    // Every panel in the result must have an id
    for (const panel of result) {
      assert.assertNotEquals(panel.id, undefined);
    }
  });
});

bdd.describe("findPanel", () => {
  bdd.it("should find panel by id", () => {
    const panels = flexLayout.computeLayout(
      {
        direction: "row",
        children: [
          { id: "a", size: { type: "flex", grow: 1 } },
          { id: "b", size: { type: "flex", grow: 1 } },
        ],
      },
      120,
      40,
    );

    const found = flexLayout.findPanel(panels, "b");

    assert.assertNotEquals(found, undefined);
    assert.assertEquals(found!.id, "b");
  });

  bdd.it("should return undefined for missing id", () => {
    const panels = flexLayout.computeLayout(
      { id: "only" },
      120,
      40,
    );

    const found = flexLayout.findPanel(panels, "nonexistent");

    assert.assertEquals(found, undefined);
  });
});

bdd.describe("createFlexNode", () => {
  bdd.it("should create node with defaults", () => {
    const node = flexLayout.createFlexNode();

    assert.assertEquals(node.direction, "column");
    assert.assertEquals(node.size, { type: "flex", grow: 1 });
    assert.assertEquals(node.gap, 0);
  });

  bdd.it("should merge overrides", () => {
    const node = flexLayout.createFlexNode({
      direction: "row",
      gap: 5,
      id: "custom",
    });

    assert.assertEquals(node.direction, "row");
    assert.assertEquals(node.gap, 5);
    assert.assertEquals(node.id, "custom");
    // Default size should still be present
    assert.assertEquals(node.size, { type: "flex", grow: 1 });
  });
});
