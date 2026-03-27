// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as concerns from "./concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await concerns.loadDefaultConcerns();

const openSource = allConcerns.find((c) => c.id === "open-source")!;
const beautiful = allConcerns.find((c) => c.id === "beautiful-product")!;
const moveFast = allConcerns.find((c) => c.id === "move-fast")!;
const compliance = allConcerns.find((c) => c.id === "compliance")!;
const longLived = allConcerns.find((c) => c.id === "long-lived")!;

// =============================================================================
// getConcernExtras
// =============================================================================

describe("getConcernExtras", () => {
  it("returns empty for no concerns", () => {
    const result = concerns.getConcernExtras([], "status_quo");

    assertEquals(result.length, 0);
  });

  it("returns matching extras for given questionId", () => {
    const result = concerns.getConcernExtras([openSource], "status_quo");

    assertEquals(result.length, 1);
    assertEquals(
      result[0]?.text,
      "Is this workaround common in the community?",
    );
  });

  it("ignores extras for non-matching questionIds", () => {
    const result = concerns.getConcernExtras([openSource], "reversibility");

    assertEquals(result.length, 0);
  });
});

// =============================================================================
// getReminders
// =============================================================================

describe("getReminders", () => {
  it("prefixes each reminder with concern id", () => {
    const result = concerns.getReminders([openSource]);

    for (const reminder of result) {
      assertEquals(reminder.startsWith("open-source: "), true);
    }
  });

  it("flattens reminders across multiple concerns", () => {
    const result = concerns.getReminders([openSource, moveFast]);

    const osCount = result.filter((r) => r.startsWith("open-source:")).length;
    const mfCount = result.filter((r) => r.startsWith("move-fast:")).length;

    assertEquals(osCount, openSource.reminders.length);
    assertEquals(mfCount, moveFast.reminders.length);
    assertEquals(result.length, osCount + mfCount);
  });
});

// =============================================================================
// detectTensions
// =============================================================================

describe("detectTensions", () => {
  it("returns empty when no conflicting concerns active", () => {
    const result = concerns.detectTensions([openSource, longLived]);

    assertEquals(result.length, 0);
  });

  it("detects move-fast + compliance tension", () => {
    const result = concerns.detectTensions([moveFast, compliance]);

    assertEquals(result.length, 1);
    assertEquals(result[0]?.between.includes("move-fast"), true);
    assertEquals(result[0]?.between.includes("compliance"), true);
  });

  it("detects move-fast + long-lived tension", () => {
    const result = concerns.detectTensions([moveFast, longLived]);

    assertEquals(result.length, 1);
    assertEquals(result[0]?.between.includes("long-lived"), true);
  });

  it("detects beautiful-product + move-fast tension", () => {
    const result = concerns.detectTensions([beautiful, moveFast]);

    assertEquals(result.length, 1);
    assertEquals(result[0]?.between.includes("beautiful-product"), true);
  });

  it("returns multiple tensions when 3+ conflicting concerns active", () => {
    const result = concerns.detectTensions([
      moveFast,
      compliance,
      longLived,
      beautiful,
    ]);

    // move-fast conflicts with: compliance, long-lived, beautiful-product
    assertEquals(result.length, 3);
  });
});
