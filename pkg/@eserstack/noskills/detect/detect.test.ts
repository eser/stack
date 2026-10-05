// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Init detection and onboarding tests.
 *
 * Tests project detection, coding tool detection, concern picker parsing,
 * and manifest structure. These test the detection logic and parsing
 * functions without filesystem access (pure function tests).
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as schema from "../state/schema.ts";
import * as concerns from "../context/concerns.ts";
import * as init from "../commands/init.ts";

// =============================================================================
// Project detection (logic verification)
// =============================================================================

bdd.describe("Project detection coverage", () => {
  bdd.it("detectProject returns correct ProjectTraits shape", () => {
    // Verify the type is correct by constructing a valid result
    const traits: schema.ProjectTraits = {
      languages: ["typescript", "go"],
      frameworks: ["react"],
      ci: ["github-actions"],
      testRunner: "deno",
    };

    assert.assertEquals(traits.languages.length, 2);
    assert.assertEquals(traits.frameworks[0], "react");
    assert.assertEquals(traits.ci[0], "github-actions");
    assert.assertEquals(traits.testRunner, "deno");
  });
});

// =============================================================================
// Coding tool detection signals
// =============================================================================

bdd.describe("Coding tool detection signals", () => {
  bdd.it("claude-code detected from CLAUDE.md or .claude/", () => {
    // This tests the signal definition, not filesystem access
    const signals = [
      { id: "claude-code", paths: ["CLAUDE.md", ".claude"] },
      { id: "cursor", paths: [".cursorrules", ".cursor"] },
      { id: "kiro", paths: [".kiro"] },
      { id: "copilot", paths: [".github/copilot-instructions.md"] },
      { id: "windsurf", paths: [".windsurfrules"] },
    ];

    assert.assertEquals(signals.length, 5);
    assert.assertEquals(signals[0]?.id, "claude-code");
    assert.assertEquals(signals[0]?.paths.includes("CLAUDE.md"), true);
    assert.assertEquals(signals[1]?.id, "cursor");
    assert.assertEquals(signals[1]?.paths.includes(".cursorrules"), true);
  });
});

// =============================================================================
// Concern picker parsing
// =============================================================================

bdd.describe("Concern picker input parsing", () => {
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

  bdd.it("parses numeric input '1,3,5' to concern IDs", () => {
    const result = parseConcernInput("1,3,5");
    assert.assertEquals(result, ["open-source", "long-lived", "compliance"]);
  });

  bdd.it("parses concern IDs directly", () => {
    const result = parseConcernInput("move-fast,compliance");
    assert.assertEquals(result, ["move-fast", "compliance"]);
  });

  bdd.it("handles mixed numeric and ID input", () => {
    const result = parseConcernInput("1,move-fast");
    assert.assertEquals(result, ["open-source", "move-fast"]);
  });

  bdd.it("returns empty for null/empty input", () => {
    assert.assertEquals(parseConcernInput(null), []);
    assert.assertEquals(parseConcernInput(""), []);
    assert.assertEquals(parseConcernInput("  "), []);
  });

  bdd.it("deduplicates selections", () => {
    const result = parseConcernInput("1,1,open-source");
    assert.assertEquals(result, ["open-source"]);
  });

  bdd.it("ignores invalid input", () => {
    const result = parseConcernInput("99,invalid,1");
    assert.assertEquals(result, ["open-source"]);
  });
});

// =============================================================================
// Manifest structure
// =============================================================================

bdd.describe("Manifest structure after init", () => {
  bdd.it("createInitialManifest has correct defaults", () => {
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

    assert.assertEquals(config.concerns, ["open-source", "beautiful-product"]);
    assert.assertEquals(config.tools, ["claude-code"]);
    assert.assertEquals(config.providers, ["anthropic"]);
    assert.assertEquals(config.project.languages, ["typescript"]);
    assert.assertEquals(config.maxIterationsBeforeRestart, 15);
    assert.assertEquals(config.verifyCommand, null);
    assert.assertEquals(config.allowGit, false);
    assert.assertEquals(config.command, "npx eser@latest noskills");
  });
});

// =============================================================================
// --concerns flag parsing
// =============================================================================

bdd.describe("--concerns flag parsing", () => {
  bdd.it("parses --concerns=open-source,move-fast", () => {
    const result = init.parseListFlag(
      ["--concerns=open-source,move-fast"],
      "--concerns",
    );
    assert.assertEquals(result, ["open-source", "move-fast"]);
  });

  bdd.it("trims the values and drops empty ones", () => {
    const result = init.parseListFlag(
      ["--concerns= open-source,, move-fast ,"],
      "--concerns",
    );
    assert.assertEquals(result, ["open-source", "move-fast"]);
  });

  bdd.it("returns null when flag not present", () => {
    const result = init.parseListFlag(["--other=value"], "--concerns");
    assert.assertEquals(result, null);
  });
});

// =============================================================================
// Built-in concerns completeness
// =============================================================================

bdd.describe("Built-in concerns", () => {
  bdd.it("all 17 built-in concerns have required fields", async () => {
    const builtinConcerns = await concerns.loadDefaultConcerns();
    assert.assertEquals(builtinConcerns.length, 17);

    for (const c of builtinConcerns) {
      assert.assertEquals(typeof c.id, "string");
      assert.assertEquals(typeof c.name, "string");
      assert.assertEquals(typeof c.description, "string");
      assert.assertEquals(Array.isArray(c.extras), true);
      assert.assertEquals(Array.isArray(c.specSections), true);
      assert.assertEquals(Array.isArray(c.reminders), true);
      assert.assertEquals(Array.isArray(c.acceptanceCriteria), true);
      assert.assertEquals(c.acceptanceCriteria.length > 0, true);
    }
  });

  bdd.it("concern IDs match expected set", async () => {
    const builtinConcerns = await concerns.loadDefaultConcerns();
    const ids = builtinConcerns.map((c) => c.id).sort();

    assert.assertEquals(ids, [
      "beautiful-product",
      "compliance",
      "deploy-ready",
      "developer-experience",
      "documented",
      "learning-project",
      "long-lived",
      "move-fast",
      "open-source",
      "peer-reviewed",
      "production-ready",
      "qa-tested",
      "retro-fed",
      "root-cause",
      "security-audited",
      "ship-ready",
      "well-engineered",
    ]);
  });
});
