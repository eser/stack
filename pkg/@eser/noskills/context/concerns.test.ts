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

  it("detects well-engineered vs move-fast tension", () => {
    const wellEngineered = allConcerns.find((c) => c.id === "well-engineered")!;
    const result = concerns.detectTensions([wellEngineered, moveFast]);

    assertEquals(result.length, 1);
    assertEquals(result[0]?.between.includes("well-engineered"), true);
    assertEquals(result[0]?.between.includes("move-fast"), true);
  });
});

// =============================================================================
// getReviewDimensions
// =============================================================================

describe("getReviewDimensions", () => {
  it("collects dimensions from all active concerns", () => {
    const result = concerns.getReviewDimensions([longLived, beautiful]);

    // long-lived has 5 dimensions, beautiful-product has 5
    assertEquals(result.length >= 10, true);
    assertEquals(result.some((d) => d.concernId === "long-lived"), true);
    assertEquals(result.some((d) => d.concernId === "beautiful-product"), true);
  });

  it("returns empty for concerns without dimensions", () => {
    const result = concerns.getReviewDimensions([moveFast]);

    // move-fast has 1 dimension (scope-knife)
    assertEquals(result.length, 1);
  });

  it("filters UI-scoped dimensions when classification excludes UI", () => {
    const result = concerns.getReviewDimensions([beautiful], {
      involvesWebUI: false,
      involvesCLI: false,
      involvesPublicAPI: false,
      involvesMigration: false,
      involvesDataHandling: false,
    });

    // beautiful-product dimensions are all scope: "ui" — should be filtered out
    assertEquals(result.length, 0);
  });

  it("includes all dimensions when classification is null", () => {
    const result = concerns.getReviewDimensions([beautiful], null);

    // null classification = include all (safe default for pre-classification phases)
    assertEquals(result.length >= 5, true);
  });
});

// =============================================================================
// getRegistryDimensionIds
// =============================================================================

describe("getRegistryDimensionIds", () => {
  it("collects registry IDs from concerns", () => {
    const result = concerns.getRegistryDimensionIds([longLived]);

    // long-lived has registries: ["error-rescue", "failure-modes"]
    assertEquals(result.includes("error-rescue"), true);
    assertEquals(result.includes("failure-modes"), true);
  });

  it("deduplicates across concerns", () => {
    const mockConcern = {
      ...longLived,
      id: "test-dup",
      registries: ["error-rescue"],
    };
    const result = concerns.getRegistryDimensionIds([
      longLived,
      mockConcern as unknown as typeof longLived,
    ]);

    const errorRescueCount = result.filter((id) => id === "error-rescue")
      .length;
    assertEquals(errorRescueCount, 1);
  });

  it("returns empty for concerns without registries", () => {
    const result = concerns.getRegistryDimensionIds([moveFast, beautiful]);

    assertEquals(result.length, 0);
  });
});

// =============================================================================
// getDreamStatePrompts
// =============================================================================

describe("getDreamStatePrompts", () => {
  it("collects dream state prompts from concerns", () => {
    const result = concerns.getDreamStatePrompts([longLived]);

    // long-lived has dreamStatePrompt
    assertEquals(result.length, 1);
    assertEquals(result[0]?.includes("CURRENT STATE"), true);
  });

  it("returns empty for concerns without dream state", () => {
    const result = concerns.getDreamStatePrompts([moveFast, compliance]);

    assertEquals(result.length, 0);
  });
});
