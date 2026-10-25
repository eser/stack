// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as box from "./box.ts";
import * as ansi from "./ansi.ts";

bdd.describe("drawBox", () => {
  bdd.it("uses single border by default", () => {
    const result = box.drawBox({ x: 1, y: 1, width: 10, height: 3 });
    assert.assertEquals(result.includes("┌"), true);
    assert.assertEquals(result.includes("┐"), true);
    assert.assertEquals(result.includes("└"), true);
    assert.assertEquals(result.includes("┘"), true);
  });

  bdd.it("uses double border when specified", () => {
    const result = box.drawBox({
      x: 1,
      y: 1,
      width: 10,
      height: 3,
      borderStyle: "double",
    });
    assert.assertEquals(result.includes("╔"), true);
    assert.assertEquals(result.includes("╗"), true);
  });

  bdd.it("uses rounded border when specified", () => {
    const result = box.drawBox({
      x: 1,
      y: 1,
      width: 10,
      height: 3,
      borderStyle: "rounded",
    });
    assert.assertEquals(result.includes("╭"), true);
    assert.assertEquals(result.includes("╮"), true);
  });

  bdd.it("includes title when provided", () => {
    const result = box.drawBox({
      x: 1,
      y: 1,
      width: 20,
      height: 3,
      title: "Test",
    });
    assert.assertEquals(result.includes("Test"), true);
  });
});

bdd.describe("fillBox", () => {
  bdd.it("renders content inside box", () => {
    const result = box.fillBox({ x: 1, y: 1, width: 20, height: 5 }, [
      "line 1",
      "line 2",
      "line 3",
    ]);
    assert.assertEquals(result.includes("line 1"), true);
    assert.assertEquals(result.includes("line 2"), true);
    assert.assertEquals(result.includes("line 3"), true);
  });

  bdd.it("truncates content that exceeds width", () => {
    const longLine = "a".repeat(100);
    const result = box.fillBox({ x: 1, y: 1, width: 20, height: 5 }, [
      longLine,
    ]);
    // The visible content should be truncated
    const stripped = ansi.stripAnsi(result);
    // Should not contain 100 'a' characters in a row
    assert.assertEquals(stripped.includes("a".repeat(100)), false);
  });
});
