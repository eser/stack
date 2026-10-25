// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as layout from "./layout.ts";

bdd.describe("calculateLayout", () => {
  bdd.it("120x40 terminal produces correct panel sizes", () => {
    const result = layout.calculateLayout(120, 40, {
      leftWidth: 0.25,
      rightTopHeight: 0.35,
    });

    assert.assertEquals(result.left.width, 30);
    assert.assertEquals(result.left.height, 39); // 40 - 1 status bar
    assert.assertEquals(result.rightTop.width, 90);
    assert.assertEquals(result.rightTop.x, 31);
    assert.assertEquals(result.rightBottom.x, 31);
    assert.assertEquals(result.statusBar.y, 40);
    assert.assertEquals(result.statusBar.width, 120);

    // Right panels should fill remaining height
    assert.assertEquals(result.rightTop.height + result.rightBottom.height, 39);
  });

  bdd.it("80x24 terminal still fits all panels", () => {
    const result = layout.calculateLayout(80, 24, {
      leftWidth: 0.25,
      rightTopHeight: 0.35,
    });

    assert.assertEquals(result.left.width, 20);
    assert.assertEquals(result.rightTop.width, 60);
    assert.assertEquals(result.statusBar.y, 24);

    // All panels have positive dimensions
    assert.assertEquals(result.left.height > 0, true);
    assert.assertEquals(result.rightTop.height > 0, true);
    assert.assertEquals(result.rightBottom.height > 0, true);
  });

  bdd.it("absolute leftWidth works", () => {
    const result = layout.calculateLayout(120, 40, {
      leftWidth: 35,
      rightTopHeight: 0.4,
    });

    assert.assertEquals(result.left.width, 35);
    assert.assertEquals(result.rightTop.width, 85);
  });
});
