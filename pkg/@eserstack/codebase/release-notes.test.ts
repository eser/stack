// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CHANGELOG.md has accumulated several heading styles over the years — bare
 * `## 1.2.3 - date` from the current generator, bracketed `## [1.2.3]` from
 * Keep a Changelog, and `## [v1.2.3]` from the generator before that.
 *
 * parseChangelogText decides which of them become GitHub Release notes, and a
 * heading it does not recognize is skipped in silence: no error, no warning,
 * just a published release with an empty body. That is exactly how v4.3.0
 * shipped with no notes, so every style the file actually contains is pinned
 * here.
 *
 * @module
 */

import { assertEquals } from "@std/assert";
import { normalizeTag, parseChangelogText } from "./release-notes.ts";

// =============================================================================
// parseChangelogText — heading styles
// =============================================================================

Deno.test("parseChangelogText reads a bare '## <version> - <date>' heading", () => {
  const entries = parseChangelogText(
    ["## 4.3.0 - 2026-08-08", "", "- feat(cli): add a thing", ""].join("\n"),
  );

  assertEquals(entries.length, 1);
  assertEquals(entries[0]!.version, "4.3.0");
  assertEquals(entries[0]!.tag, "v4.3.0");
  assertEquals(entries[0]!.date, "2026-08-08");
});

Deno.test("parseChangelogText reads a bracketed '## [<version>] - <date>' heading", () => {
  const entries = parseChangelogText(
    ["## [4.1.0] - 2025-01-01", "", "- fix: an older thing", ""].join("\n"),
  );

  assertEquals(entries.length, 1);
  assertEquals(entries[0]!.version, "4.1.0");
  assertEquals(entries[0]!.tag, "v4.1.0");
  assertEquals(entries[0]!.date, "2025-01-01");
});

// The regression that emptied the v4.3.0 release notes: the `v` inside the
// brackets survived into the version string, the `^\d` guard below the match
// then read it as a non-version heading like [Unreleased], and the section
// vanished from the parse entirely.
Deno.test("parseChangelogText reads a v-prefixed '## [v<version>]' heading", () => {
  const entries = parseChangelogText(
    ["## [v4.1.61] - 2025-01-01", "", "- fix: a legacy-style section", ""]
      .join("\n"),
  );

  assertEquals(entries.length, 1);
  assertEquals(entries[0]!.version, "4.1.61");
  assertEquals(entries[0]!.tag, "v4.1.61");
  assertEquals(entries[0]!.date, "2025-01-01");
});

Deno.test("parseChangelogText keeps all three heading styles in file order", () => {
  const entries = parseChangelogText(
    [
      "# Changelog",
      "",
      "## 4.3.0 - 2026-08-08",
      "",
      "- newest",
      "",
      "## [4.2.0] - 2025-06-01",
      "",
      "- middle",
      "",
      "## [v4.1.61] - 2025-01-01",
      "",
      "- oldest",
      "",
    ].join("\n"),
  );

  assertEquals(entries.map((entry) => entry.tag), [
    "v4.3.0",
    "v4.2.0",
    "v4.1.61",
  ]);
});

// =============================================================================
// parseChangelogText — non-version headings
// =============================================================================

Deno.test("parseChangelogText skips Unreleased in both heading styles", () => {
  const entries = parseChangelogText(
    [
      "# Changelog",
      "",
      "## Unreleased",
      "",
      "- not shipped yet",
      "",
      "## [Unreleased]",
      "",
      "- also not shipped",
      "",
      "## 4.3.0 - 2026-08-08",
      "",
      "- shipped",
      "",
    ].join("\n"),
  );

  assertEquals(entries.map((entry) => entry.version), ["4.3.0"]);
});

// =============================================================================
// parseChangelogText — notes body
// =============================================================================

Deno.test("parseChangelogText captures the body between two headings", () => {
  const entries = parseChangelogText(
    [
      "# Changelog",
      "",
      "## 4.3.0 - 2026-08-08",
      "",
      "### Features",
      "",
      "- add a thing",
      "",
      "## 4.2.0 - 2026-07-01",
      "",
      "- an older thing",
      "",
    ].join("\n"),
  );

  assertEquals(entries.length, 2);
  assertEquals(
    entries[0]!.notes,
    "## 4.3.0 - 2026-08-08\n\n### Features\n\n- add a thing\n",
  );
  assertEquals(
    entries[1]!.notes,
    "## 4.2.0 - 2026-07-01\n\n- an older thing\n",
  );
});

// The rendered heading drops the legacy `v`, so notes read the same regardless
// of which generator wrote the section.
Deno.test("parseChangelogText renders a v-prefixed section under its bare version", () => {
  const entries = parseChangelogText(
    ["## [v4.1.61] - 2025-01-01", "", "- a legacy-style section", ""].join(
      "\n",
    ),
  );

  assertEquals(
    entries[0]!.notes,
    "## 4.1.61 - 2025-01-01\n\n- a legacy-style section\n",
  );
});

Deno.test("parseChangelogText returns no entries when nothing is a version", () => {
  assertEquals(
    parseChangelogText("# Changelog\n\n## [Unreleased]\n\n- soon\n"),
    [],
  );
});

// =============================================================================
// normalizeTag
// =============================================================================

Deno.test("normalizeTag adds the v prefix, keeps it, and strips refs/tags/", () => {
  // The three shapes a tag arrives in: a VERSION file read, a hand-typed
  // --tag, and GITHUB_REF from a tag-triggered workflow.
  assertEquals(normalizeTag("4.3.0"), "v4.3.0");
  assertEquals(normalizeTag("v4.3.0"), "v4.3.0");
  assertEquals(normalizeTag("refs/tags/v4.3.0"), "v4.3.0");
  assertEquals(normalizeTag("  v4.3.0  "), "v4.3.0");
});
