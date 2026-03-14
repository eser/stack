// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  deduplicateCommits,
  generateChangelogSection,
  groupBySection,
  insertIntoChangelog,
  parseConventionalCommit,
  stripTakeSuffix,
} from "./changelog-gen.ts";
import type { ConventionalCommit } from "./changelog-gen.ts";

// =============================================================================
// parseConventionalCommit
// =============================================================================

Deno.test("parseConventionalCommit - feat with scope", () => {
  const result = parseConventionalCommit(
    "feat(auth): add login system",
    "abc123",
  );
  assert.assertExists(result);
  assert.assertEquals(result.type, "feat");
  assert.assertEquals(result.scope, "auth");
  assert.assertEquals(result.message, "add login system");
  assert.assertEquals(result.hash, "abc123");
});

Deno.test("parseConventionalCommit - fix without scope", () => {
  const result = parseConventionalCommit(
    "fix: resolve crash on startup",
    "def456",
  );
  assert.assertExists(result);
  assert.assertEquals(result.type, "fix");
  assert.assertEquals(result.scope, undefined);
  assert.assertEquals(result.message, "resolve crash on startup");
});

Deno.test("parseConventionalCommit - breaking change with !", () => {
  const result = parseConventionalCommit(
    "feat(api)!: remove deprecated endpoint",
    "ghi789",
  );
  assert.assertExists(result);
  assert.assertEquals(result.type, "feat");
  assert.assertEquals(result.scope, "api");
  assert.assertEquals(result.message, "remove deprecated endpoint");
});

Deno.test("parseConventionalCommit - non-conventional returns undefined", () => {
  const result = parseConventionalCommit("random commit message", "jkl012");
  assert.assertEquals(result, undefined);
});

Deno.test("parseConventionalCommit - chore type", () => {
  const result = parseConventionalCommit(
    "chore(deps): bump versions",
    "mno345",
  );
  assert.assertExists(result);
  assert.assertEquals(result.type, "chore");
});

// =============================================================================
// stripTakeSuffix
// =============================================================================

Deno.test("stripTakeSuffix - roman numeral", () => {
  assert.assertEquals(
    stripTakeSuffix("authentication system (take II)."),
    "authentication system",
  );
});

Deno.test("stripTakeSuffix - roman numeral III", () => {
  assert.assertEquals(
    stripTakeSuffix("authentication system (take III)"),
    "authentication system",
  );
});

Deno.test("stripTakeSuffix - arabic number", () => {
  assert.assertEquals(
    stripTakeSuffix("styling issues (take 3)"),
    "styling issues",
  );
});

Deno.test("stripTakeSuffix - no take suffix", () => {
  assert.assertEquals(
    stripTakeSuffix("normal commit message"),
    "normal commit message",
  );
});

Deno.test("stripTakeSuffix - case insensitive", () => {
  assert.assertEquals(
    stripTakeSuffix("feature (Take IV)"),
    "feature",
  );
});

// =============================================================================
// deduplicateCommits
// =============================================================================

Deno.test("deduplicateCommits - collapses take series", () => {
  const commits: ConventionalCommit[] = [
    {
      type: "feat",
      scope: "auth",
      message: "authentication system.",
      hash: "a",
    },
    {
      type: "feat",
      scope: "auth",
      message: "authentication system (take II).",
      hash: "b",
    },
    { type: "fix", scope: "ui", message: "styling issues.", hash: "c" },
    {
      type: "feat",
      scope: "auth",
      message: "authentication system (take III).",
      hash: "d",
    },
  ];

  const result = deduplicateCommits(commits);
  assert.assertEquals(result.length, 2);
  assert.assertEquals(result[0]!.message, "authentication system.");
  assert.assertEquals(result[1]!.message, "styling issues.");
});

Deno.test("deduplicateCommits - different types are not deduped", () => {
  const commits: ConventionalCommit[] = [
    { type: "feat", scope: undefined, message: "add feature", hash: "a" },
    { type: "fix", scope: undefined, message: "add feature", hash: "b" },
  ];

  const result = deduplicateCommits(commits);
  assert.assertEquals(result.length, 2);
});

Deno.test("deduplicateCommits - empty input", () => {
  const result = deduplicateCommits([]);
  assert.assertEquals(result.length, 0);
});

// =============================================================================
// groupBySection
// =============================================================================

Deno.test("groupBySection - maps types to sections", () => {
  const commits: ConventionalCommit[] = [
    { type: "feat", scope: undefined, message: "new feature", hash: "a" },
    { type: "fix", scope: undefined, message: "bug fix", hash: "b" },
    { type: "refactor", scope: undefined, message: "clean up", hash: "c" },
    { type: "chore", scope: undefined, message: "bump deps", hash: "d" },
  ];

  const groups = groupBySection(commits);
  assert.assertEquals(groups.size, 3);
  assert.assertEquals(groups.get("Added")!.length, 1);
  assert.assertEquals(groups.get("Fixed")!.length, 1);
  assert.assertEquals(groups.get("Changed")!.length, 1);
  assert.assertEquals(groups.has("Removed"), false);
});

Deno.test("groupBySection - skips chore, ci, test", () => {
  const commits: ConventionalCommit[] = [
    { type: "chore", scope: undefined, message: "bump deps", hash: "a" },
    { type: "ci", scope: undefined, message: "fix pipeline", hash: "b" },
    { type: "test", scope: undefined, message: "add tests", hash: "c" },
  ];

  const groups = groupBySection(commits);
  assert.assertEquals(groups.size, 0);
});

// =============================================================================
// generateChangelogSection
// =============================================================================

Deno.test("generateChangelogSection - produces markdown", () => {
  const commits: ConventionalCommit[] = [
    { type: "feat", scope: "auth", message: "add login", hash: "a" },
    { type: "fix", scope: undefined, message: "fix crash", hash: "b" },
  ];

  const section = generateChangelogSection("4.1.2", commits);
  assert.assertStringIncludes(section, "## 4.1.2 -");
  assert.assertStringIncludes(section, "### Added");
  assert.assertStringIncludes(section, "- **auth:** add login");
  assert.assertStringIncludes(section, "### Fixed");
  assert.assertStringIncludes(section, "- fix crash");
});

Deno.test("generateChangelogSection - empty when all skipped", () => {
  const commits: ConventionalCommit[] = [
    { type: "chore", scope: undefined, message: "bump", hash: "a" },
  ];

  const section = generateChangelogSection("1.0.0", commits);
  assert.assertEquals(section, "");
});

Deno.test("generateChangelogSection - section ordering", () => {
  const commits: ConventionalCommit[] = [
    { type: "fix", scope: undefined, message: "bug", hash: "a" },
    { type: "feat", scope: undefined, message: "feature", hash: "b" },
    { type: "revert", scope: undefined, message: "undo", hash: "c" },
    { type: "refactor", scope: undefined, message: "clean", hash: "d" },
  ];

  const section = generateChangelogSection("1.0.0", commits);
  const addedIdx = section.indexOf("### Added");
  const changedIdx = section.indexOf("### Changed");
  const fixedIdx = section.indexOf("### Fixed");
  const removedIdx = section.indexOf("### Removed");

  // Order: Added, Changed, Fixed, Removed
  assert.assert(addedIdx < changedIdx);
  assert.assert(changedIdx < fixedIdx);
  assert.assert(fixedIdx < removedIdx);
});

// =============================================================================
// insertIntoChangelog
// =============================================================================

Deno.test("insertIntoChangelog - inserts after [Unreleased]", () => {
  const existing = `# Changelog

## [Unreleased]

### Added

- something in progress

## 4.1.1 - 2024-07-16

### Fixed

- old fix
`;

  const newSection = `## 4.1.2 - 2025-03-14

### Added

- new feature`;

  const result = insertIntoChangelog(existing, newSection);
  assert.assertStringIncludes(result, "## [Unreleased]");
  assert.assertStringIncludes(result, "## 4.1.2 - 2025-03-14");
  assert.assertStringIncludes(result, "## 4.1.1 - 2024-07-16");

  // New section should come between [Unreleased] and 4.1.1
  const unreleasedIdx = result.indexOf("## [Unreleased]");
  const newIdx = result.indexOf("## 4.1.2");
  const oldIdx = result.indexOf("## 4.1.1");
  assert.assert(unreleasedIdx < newIdx);
  assert.assert(newIdx < oldIdx);
});

Deno.test("insertIntoChangelog - no [Unreleased] section", () => {
  const existing = `# Changelog

## 4.1.1 - 2024-07-16

### Fixed

- old fix
`;

  const newSection = `## 4.1.2 - 2025-03-14

### Added

- new feature`;

  const result = insertIntoChangelog(existing, newSection);
  assert.assertStringIncludes(result, "## 4.1.2 - 2025-03-14");
  // Should be inserted before the existing section
  const newIdx = result.indexOf("## 4.1.2");
  const oldIdx = result.indexOf("## 4.1.1");
  assert.assert(newIdx < oldIdx);
});
