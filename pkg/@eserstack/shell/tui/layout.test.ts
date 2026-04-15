// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as layout from "./layout.ts";

describe("calculateLayout", () => {
  it("120x40 terminal produces correct panel sizes", () => {
    const result = layout.calculateLayout(120, 40, {
      leftWidth: 0.25,
      rightTopHeight: 0.35,
    });

    assertEquals(result.left.width, 30);
    assertEquals(result.left.height, 39); // 40 - 1 status bar
    assertEquals(result.rightTop.width, 90);
    assertEquals(result.rightTop.x, 31);
    assertEquals(result.rightBottom.x, 31);
    assertEquals(result.statusBar.y, 40);
    assertEquals(result.statusBar.width, 120);

    // Right panels should fill remaining height
    assertEquals(
      result.rightTop.height + result.rightBottom.height,
      39,
    );
  });

  it("80x24 terminal still fits all panels", () => {
    const result = layout.calculateLayout(80, 24, {
      leftWidth: 0.25,
      rightTopHeight: 0.35,
    });

    assertEquals(result.left.width, 20);
    assertEquals(result.rightTop.width, 60);
    assertEquals(result.statusBar.y, 24);

    // All panels have positive dimensions
    assertEquals(result.left.height > 0, true);
    assertEquals(result.rightTop.height > 0, true);
    assertEquals(result.rightBottom.height > 0, true);
  });

  it("absolute leftWidth works", () => {
    const result = layout.calculateLayout(120, 40, {
      leftWidth: 35,
      rightTopHeight: 0.4,
    });

    assertEquals(result.left.width, 35);
    assertEquals(result.rightTop.width, 85);
  });
});
