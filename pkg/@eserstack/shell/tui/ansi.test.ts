// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as ansi from "./ansi.ts";

describe("ansi", () => {
  it("bold wraps text", () => {
    const result = ansi.bold("hello");
    assertEquals(result.includes("hello"), true);
    assertEquals(result.startsWith("\x1b[1m"), true);
  });

  it("dim wraps text", () => {
    const result = ansi.dim("hello");
    assertEquals(result.includes("hello"), true);
    assertEquals(result.startsWith("\x1b[2m"), true);
  });

  it("green wraps text", () => {
    const result = ansi.green("ok");
    assertEquals(result.includes("ok"), true);
    assertEquals(result.startsWith("\x1b[32m"), true);
  });

  it("stripAnsi removes ANSI codes", () => {
    const styled = ansi.bold(ansi.green("hello"));
    assertEquals(ansi.stripAnsi(styled), "hello");
  });

  it("visibleLength ignores ANSI codes", () => {
    const styled = ansi.bold("hello");
    assertEquals(ansi.visibleLength(styled), 5);
  });

  it("truncate respects maxWidth", () => {
    const long = "a".repeat(50);
    const result = ansi.truncate(long, 10);
    assertEquals(ansi.visibleLength(result) <= 10, true);
  });

  it("truncate preserves short text", () => {
    assertEquals(ansi.truncate("hi", 10), "hi");
  });

  it("moveTo generates correct escape", () => {
    assertEquals(ansi.moveTo(5, 10), "\x1b[5;10H");
  });
});
