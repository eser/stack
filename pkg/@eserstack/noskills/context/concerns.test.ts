// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { assertEquals, assertRejects } from "@std/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
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

    // long-lived has 7 dimensions, beautiful-product has 7
    assertEquals(result.length >= 10, true);
    assertEquals(result.some((d) => d.concernId === "long-lived"), true);
    assertEquals(result.some((d) => d.concernId === "beautiful-product"), true);
  });

  it("returns empty for concerns without dimensions", () => {
    const result = concerns.getReviewDimensions([moveFast]);

    // move-fast has scope-knife, lake-check, feedback-loop
    assertEquals(result.length, 3);
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

// =============================================================================
// loadConcerns — promptFile resolution
// =============================================================================

describe("loadConcerns — promptFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_concerns_",
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  const writeJson = async (path: string, data: unknown): Promise<void> => {
    await crossRuntime.runtime.fs.writeTextFile(path, JSON.stringify(data));
  };

  it("appends promptFile content to reminders when file exists", async () => {
    const extraContent = "Extra rule from markdown companion file.";
    const concernJson = {
      id: "test-concern",
      name: "Test",
      description: "Test concern",
      extras: [],
      specSections: [],
      reminders: ["Inline reminder"],
      acceptanceCriteria: [],
      promptFile: "companion.md",
    };

    await writeJson(`${tempDir}/100-test-concern.json`, concernJson);
    await crossRuntime.runtime.fs.writeTextFile(
      `${tempDir}/companion.md`,
      extraContent,
    );

    const loaded = await concerns.loadConcerns(tempDir);

    assertEquals(loaded.length, 1);
    assertEquals(loaded[0]!.reminders.length, 2);
    assertEquals(loaded[0]!.reminders[0], "Inline reminder");
    assertEquals(loaded[0]!.reminders[1], extraContent);
  });

  it("throws a clear error when promptFile is missing", async () => {
    const concernJson = {
      id: "test-concern",
      name: "Test",
      description: "Test concern",
      extras: [],
      specSections: [],
      reminders: [],
      acceptanceCriteria: [],
      promptFile: "missing.md",
    };

    await writeJson(`${tempDir}/100-test-concern.json`, concernJson);

    await assertRejects(
      () => concerns.loadConcerns(tempDir),
      Error,
      "promptFile not found",
    );
  });

  it("skips promptFile field when it is not set", async () => {
    const concernJson = {
      id: "test-concern",
      name: "Test",
      description: "Test concern",
      extras: [],
      specSections: [],
      reminders: ["Only this"],
      acceptanceCriteria: [],
    };

    await writeJson(`${tempDir}/100-test-concern.json`, concernJson);

    const loaded = await concerns.loadConcerns(tempDir);

    assertEquals(loaded[0]!.reminders.length, 1);
    assertEquals(loaded[0]!.reminders[0], "Only this");
  });

  it("ignores empty promptFile content (no extra reminder added)", async () => {
    const concernJson = {
      id: "test-concern",
      name: "Test",
      description: "Test concern",
      extras: [],
      specSections: [],
      reminders: ["Inline"],
      acceptanceCriteria: [],
      promptFile: "empty.md",
    };

    await writeJson(`${tempDir}/100-test-concern.json`, concernJson);
    // Write a file with only whitespace
    await crossRuntime.runtime.fs.writeTextFile(`${tempDir}/empty.md`, "   \n");

    const loaded = await concerns.loadConcerns(tempDir);

    // Whitespace-only content → not appended
    assertEquals(loaded[0]!.reminders.length, 1);
  });
});

// =============================================================================
// SpecSectionDefinition object shape
// =============================================================================

describe("loadConcerns with SpecSectionDefinition object shape", () => {
  let tempDir: string;

  const writeJson = (path: string, data: unknown) =>
    crossRuntime.runtime.fs.writeTextFile(path, JSON.stringify(data));

  beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "concerns_section_def_",
    });
  });

  afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  it("loads concern with SpecSectionDefinition specSections correctly", async () => {
    const concernJson = {
      id: "test-concern",
      name: "Test",
      description: "Test concern",
      extras: [],
      specSections: [
        {
          id: "my-section",
          title: "My Section",
          placeholder: "_placeholder_",
          condition: null,
          position: "after:acceptance-criteria",
        },
      ],
      reminders: [],
      acceptanceCriteria: ["One criterion"],
    };

    await writeJson(`${tempDir}/100-test-concern.json`, concernJson);
    const loaded = await concerns.loadConcerns(tempDir);

    assertEquals(loaded.length, 1);
    const sec = loaded[0]!.specSections[0];
    assertEquals(typeof sec, "object");
    // Type narrowing: the object shape has an `id` property
    assertEquals(typeof (sec as { id: string }).id, "string");
    assertEquals((sec as { id: string }).id, "my-section");
    assertEquals((sec as { title: string }).title, "My Section");
    assertEquals((sec as { condition: null }).condition, null);
  });

  it("loads concern with legacy string specSections (backward compat)", async () => {
    const concernJson = {
      id: "legacy-concern",
      name: "Legacy",
      description: "Legacy format",
      extras: [],
      specSections: ["Legacy Section One", "Legacy Section Two"],
      reminders: [],
      acceptanceCriteria: ["ok"],
    };

    await writeJson(`${tempDir}/200-legacy-concern.json`, concernJson);
    const loaded = await concerns.loadConcerns(tempDir);

    assertEquals(loaded.length, 1);
    assertEquals(loaded[0]!.specSections.length, 2);
    // The strings are preserved as-is in the loaded concern; living.ts normalizes them
    assertEquals(loaded[0]!.specSections[0], "Legacy Section One");
  });

  it("loads concern with conductRules correctly", async () => {
    const concernJson = {
      id: "conduct-concern",
      name: "Conduct",
      description: "Has per-phase rules",
      extras: [],
      specSections: [],
      reminders: [],
      acceptanceCriteria: ["ok"],
      conductRules: {
        DISCOVERY: [
          "Ask about failure modes first.",
          "Ask about recovery paths next.",
        ],
      },
    };

    await writeJson(`${tempDir}/300-conduct-concern.json`, concernJson);
    const loaded = await concerns.loadConcerns(tempDir);

    assertEquals(loaded.length, 1);
    const rules = loaded[0]!.conductRules?.["DISCOVERY"] ?? [];
    assertEquals(rules.length, 2);
    assertEquals(rules[0], "Ask about failure modes first.");
  });
});
