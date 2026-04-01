// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as box from "./box.ts";
import * as ansi from "./ansi.ts";

describe("drawBox", () => {
  it("uses single border by default", () => {
    const result = box.drawBox({ x: 1, y: 1, width: 10, height: 3 });
    assertEquals(result.includes("┌"), true);
    assertEquals(result.includes("┐"), true);
    assertEquals(result.includes("└"), true);
    assertEquals(result.includes("┘"), true);
  });

  it("uses double border when specified", () => {
    const result = box.drawBox({
      x: 1,
      y: 1,
      width: 10,
      height: 3,
      borderStyle: "double",
    });
    assertEquals(result.includes("╔"), true);
    assertEquals(result.includes("╗"), true);
  });

  it("uses rounded border when specified", () => {
    const result = box.drawBox({
      x: 1,
      y: 1,
      width: 10,
      height: 3,
      borderStyle: "rounded",
    });
    assertEquals(result.includes("╭"), true);
    assertEquals(result.includes("╮"), true);
  });

  it("includes title when provided", () => {
    const result = box.drawBox({
      x: 1,
      y: 1,
      width: 20,
      height: 3,
      title: "Test",
    });
    assertEquals(result.includes("Test"), true);
  });
});

describe("fillBox", () => {
  it("renders content inside box", () => {
    const result = box.fillBox(
      { x: 1, y: 1, width: 20, height: 5 },
      ["line 1", "line 2", "line 3"],
    );
    assertEquals(result.includes("line 1"), true);
    assertEquals(result.includes("line 2"), true);
    assertEquals(result.includes("line 3"), true);
  });

  it("truncates content that exceeds width", () => {
    const longLine = "a".repeat(100);
    const result = box.fillBox(
      { x: 1, y: 1, width: 20, height: 5 },
      [longLine],
    );
    // The visible content should be truncated
    const stripped = ansi.stripAnsi(result);
    // Should not contain 100 'a' characters in a row
    assertEquals(stripped.includes("a".repeat(100)), false);
  });
});
