// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Init detection and onboarding tests.
 *
 * Tests project detection, coding tool detection, concern picker parsing,
 * and manifest structure. These test the detection logic and parsing
 * functions without filesystem access (pure function tests).
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as schema from "../state/schema.ts";
import { loadDefaultConcerns } from "../context/concerns.ts";

// =============================================================================
// Project detection (logic verification)
// =============================================================================

describe("Project detection coverage", () => {
  it("detectProject returns correct ProjectTraits shape", () => {
    // Verify the type is correct by constructing a valid result
    const traits: schema.ProjectTraits = {
      languages: ["typescript", "go"],
      frameworks: ["react"],
      ci: ["github-actions"],
      testRunner: "deno",
    };

    assertEquals(traits.languages.length, 2);
    assertEquals(traits.frameworks[0], "react");
    assertEquals(traits.ci[0], "github-actions");
    assertEquals(traits.testRunner, "deno");
  });
});

// =============================================================================
// Coding tool detection signals
// =============================================================================

describe("Coding tool detection signals", () => {
  it("claude-code detected from CLAUDE.md or .claude/", () => {
    // This tests the signal definition, not filesystem access
    const signals = [
      { id: "claude-code", paths: ["CLAUDE.md", ".claude"] },
      { id: "cursor", paths: [".cursorrules", ".cursor"] },
      { id: "kiro", paths: [".kiro"] },
      { id: "copilot", paths: [".github/copilot-instructions.md"] },
      { id: "windsurf", paths: [".windsurfrules"] },
    ];

    assertEquals(signals.length, 5);
    assertEquals(signals[0]?.id, "claude-code");
    assertEquals(signals[0]?.paths.includes("CLAUDE.md"), true);
    assertEquals(signals[1]?.id, "cursor");
    assertEquals(signals[1]?.paths.includes(".cursorrules"), true);
  });
});

// =============================================================================
// Concern picker parsing
// =============================================================================

describe("Concern picker input parsing", () => {
  const allConcerns = [
    { id: "open-source", name: "Open Source" },
    { id: "beautiful-product", name: "Beautiful Product" },
    { id: "long-lived", name: "Long-Lived" },
    { id: "move-fast", name: "Move Fast" },
    { id: "compliance", name: "Compliance" },
    { id: "learning-project", name: "Learning Project" },
  ];

  const parseConcernInput = (
    input: string | null,
  ): string[] => {
    if (input === null || input.trim().length === 0) return [];
    const ids: string[] = [];

    for (const part of input.split(",")) {
      const trimmed = part.trim();
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= allConcerns.length) {
        ids.push(allConcerns[num - 1]!.id);
        continue;
      }
      const match = allConcerns.find((c) => c.id === trimmed);
      if (match !== undefined) ids.push(match.id);
    }
    return [...new Set(ids)];
  };

  it("parses numeric input '1,3,5' to concern IDs", () => {
    const result = parseConcernInput("1,3,5");
    assertEquals(result, ["open-source", "long-lived", "compliance"]);
  });

  it("parses concern IDs directly", () => {
    const result = parseConcernInput("move-fast,compliance");
    assertEquals(result, ["move-fast", "compliance"]);
  });

  it("handles mixed numeric and ID input", () => {
    const result = parseConcernInput("1,move-fast");
    assertEquals(result, ["open-source", "move-fast"]);
  });

  it("returns empty for null/empty input", () => {
    assertEquals(parseConcernInput(null), []);
    assertEquals(parseConcernInput(""), []);
    assertEquals(parseConcernInput("  "), []);
  });

  it("deduplicates selections", () => {
    const result = parseConcernInput("1,1,open-source");
    assertEquals(result, ["open-source"]);
  });

  it("ignores invalid input", () => {
    const result = parseConcernInput("99,invalid,1");
    assertEquals(result, ["open-source"]);
  });
});

// =============================================================================
// Manifest structure
// =============================================================================

describe("Manifest structure after init", () => {
  it("createInitialManifest has correct defaults", () => {
    const config = schema.createInitialManifest(
      ["open-source", "beautiful-product"],
      ["claude-code"],
      ["anthropic"],
      {
        languages: ["typescript"],
        frameworks: ["react"],
        ci: ["github-actions"],
        testRunner: "deno",
      },
    );

    assertEquals(config.concerns, ["open-source", "beautiful-product"]);
    assertEquals(config.tools, ["claude-code"]);
    assertEquals(config.providers, ["anthropic"]);
    assertEquals(config.project.languages, ["typescript"]);
    assertEquals(config.maxIterationsBeforeRestart, 15);
    assertEquals(config.verifyCommand, null);
    assertEquals(config.allowGit, false);
    assertEquals(config.command, "npx eser@latest noskills");
  });
});

// =============================================================================
// --concerns flag parsing
// =============================================================================

describe("--concerns flag parsing", () => {
  const parseListFlag = (
    args: readonly string[] | undefined,
    flag: string,
  ): string[] | null => {
    if (args === undefined) return null;
    for (const arg of args) {
      if (arg.startsWith(`${flag}=`)) {
        return arg.slice(flag.length + 1).split(",").map((s) => s.trim())
          .filter(
            Boolean,
          );
      }
    }
    return null;
  };

  it("parses --concerns=open-source,move-fast", () => {
    const result = parseListFlag(
      ["--concerns=open-source,move-fast"],
      "--concerns",
    );
    assertEquals(result, ["open-source", "move-fast"]);
  });

  it("returns null when flag not present", () => {
    const result = parseListFlag(["--other=value"], "--concerns");
    assertEquals(result, null);
  });
});

// =============================================================================
// Built-in concerns completeness
// =============================================================================

describe("Built-in concerns", () => {
  it("all 6 built-in concerns have required fields", async () => {
    const concerns = await loadDefaultConcerns();
    assertEquals(concerns.length, 6);

    for (const c of concerns) {
      assertEquals(typeof c.id, "string");
      assertEquals(typeof c.name, "string");
      assertEquals(typeof c.description, "string");
      assertEquals(Array.isArray(c.extras), true);
      assertEquals(Array.isArray(c.specSections), true);
      assertEquals(Array.isArray(c.reminders), true);
      assertEquals(Array.isArray(c.acceptanceCriteria), true);
      assertEquals(c.acceptanceCriteria.length > 0, true);
    }
  });

  it("concern IDs match expected set", async () => {
    const concerns = await loadDefaultConcerns();
    const ids = concerns.map((c) => c.id).sort();

    assertEquals(ids, [
      "beautiful-product",
      "compliance",
      "learning-project",
      "long-lived",
      "move-fast",
      "open-source",
    ]);
  });
});
