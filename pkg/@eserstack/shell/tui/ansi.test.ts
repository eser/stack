// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as ansi from "./ansi.ts";

bdd.describe("ansi", () => {
  bdd.it("bold wraps text", () => {
    const result = ansi.bold("hello");
    assert.assertEquals(result.includes("hello"), true);
    assert.assertEquals(result.startsWith("\x1b[1m"), true);
  });

  bdd.it("dim wraps text", () => {
    const result = ansi.dim("hello");
    assert.assertEquals(result.includes("hello"), true);
    assert.assertEquals(result.startsWith("\x1b[2m"), true);
  });

  bdd.it("green wraps text", () => {
    const result = ansi.green("ok");
    assert.assertEquals(result.includes("ok"), true);
    assert.assertEquals(result.startsWith("\x1b[32m"), true);
  });

  bdd.it("stripAnsi removes ANSI codes", () => {
    const styled = ansi.bold(ansi.green("hello"));
    assert.assertEquals(ansi.stripAnsi(styled), "hello");
  });

  bdd.it("visibleLength ignores ANSI codes", () => {
    const styled = ansi.bold("hello");
    assert.assertEquals(ansi.visibleLength(styled), 5);
  });

  bdd.it("truncate respects maxWidth", () => {
    const long = "a".repeat(50);
    const result = ansi.truncate(long, 10);
    assert.assertEquals(ansi.visibleLength(result) <= 10, true);
  });

  bdd.it("truncate preserves short text", () => {
    assert.assertEquals(ansi.truncate("hi", 10), "hi");
  });

  bdd.it("moveTo generates correct escape", () => {
    assert.assertEquals(ansi.moveTo(5, 10), "\x1b[5;10H");
  });
});
