// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as changelogText from "./changelog-text.ts";

// Every path is built from this file's directory, so the tests do not depend
// on the working directory the suite runs from.
const testDir = import.meta.dirname;
if (testDir === undefined) {
  throw new Error(
    "changelog-text.test.ts must run from a local file: it reads sources " +
      "relative to its own directory.",
  );
}

const repoRoot = runtime.path.resolve(testDir, "../../..");

const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(/^\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gm)].map(
    (m) => m[1]!,
  );

nodeTest.test("changelog-text.ts imports nothing", async () => {
  const source = await runtime.fs.readTextFile(
    runtime.path.join(testDir, "changelog-text.ts"),
  );
  assert.assertEquals(importSpecifiers(source), []);
});

nodeTest.test(
  "release notes extractor imports only node built-ins and the parser",
  async () => {
    const source = await runtime.fs.readTextFile(
      runtime.path.join(
        repoRoot,
        "etc/scripts/release-notes-from-changelog.ts",
      ),
    );
    for (const spec of importSpecifiers(source)) {
      assert.assert(
        spec.startsWith("node:") ||
          spec === "../../pkg/@eserstack/codebase/changelog-text.ts",
        `unexpected import ${spec}`,
      );
    }
  },
);

// The release-notes job holds contents: write. It must not resolve and run
// registry packages, and must not leave the token in .git/config.
nodeTest.test(
  "release-notes job installs nothing and does not persist credentials",
  async () => {
    const workflow = await runtime.fs.readTextFile(
      runtime.path.join(repoRoot, ".github/workflows/build.yml"),
    );
    const start = workflow.indexOf("\n  release-notes:\n");
    assert.assert(start !== -1, "release-notes job not found");
    const rest = workflow.slice(start + 1);
    const next = rest.search(/\n {2}[a-z0-9-]+:\n/);
    const job = next === -1 ? rest : rest.slice(0, next);

    assert.assert(!/\b(npm|pnpm|yarn)\s+(install|add|i|ci)\b/.test(job));
    assert.assert(!/\bnpx\b/.test(job));
    assert.assert(/persist-credentials:\s*false/.test(job));
    assert.assert(job.includes("etc/scripts/release-notes-from-changelog.ts"));
  },
);

nodeTest.test("parseChangelogText still reads both heading styles", () => {
  const entries = changelogText.parseChangelogText(
    "# Changelog\n\n## 2.0.0 - 2026-01-02\n\n- b\n\n## [v1.0.0] - 2026-01-01\n\n- a\n",
  );
  assert.assertEquals(
    entries.map((e) => e.tag),
    ["v2.0.0", "v1.0.0"],
  );
});

// =============================================================================
// fitReleaseNotes
// =============================================================================

const longNotes = (migrationLines: number): string =>
  [
    "## 5.0.0 - 2026-11-16",
    "",
    "### Added",
    "",
    "- **cli**: add a flag (abc1234)",
    "",
    "### Migration",
    "",
    "```md",
    "### not a section, a line inside a code block",
    "```",
    "",
    ...Array.from({ length: migrationLines }, (_, i) => `- step ${i}`),
    "",
  ].join("\n");

nodeTest.test("fitReleaseNotes keeps notes under the limit as they are", () => {
  const notes = longNotes(3);

  assert.assertEquals(
    changelogText.fitReleaseNotes(notes, "eser/stack", 10_000),
    notes,
  );
});

nodeTest.test(
  "fitReleaseNotes drops the last sections and links to the changelog",
  () => {
    const fitted = changelogText.fitReleaseNotes(
      longNotes(2_000),
      "eser/stack",
      2_000,
    );

    assert.assert(fitted.length <= 2_000, `${fitted.length} chars`);
    assert.assertStringIncludes(fitted, "### Added\n\n- **cli**: add a flag");
    assert.assertEquals(fitted.includes("### Migration"), false);
    assert.assertEquals(fitted.includes("- step 0"), false);
    assert.assertStringIncludes(
      fitted,
      "Migration did not fit in the GitHub Release; read it in " +
        "[CHANGELOG.md](https://github.com/eser/stack/blob/v5.0.0/CHANGELOG.md#500---2026-11-16).",
    );
  },
);

nodeTest.test(
  "fitReleaseNotes does not split at a heading inside a code block",
  () => {
    const fitted = changelogText.fitReleaseNotes(
      longNotes(2_000),
      "eser/stack",
      2_000,
    );

    assert.assertEquals(fitted.includes("not a section"), false);
  },
);

nodeTest.test(
  "fitReleaseNotes cuts at a line when the first section alone is too long",
  () => {
    const notes = `## 5.0.0 - 2026-11-16\n\n${"- a line of the intro\n".repeat(500)}`;
    const fitted = changelogText.fitReleaseNotes(notes, "eser/stack", 1_000);

    assert.assert(fitted.length <= 1_000, `${fitted.length} chars`);
    assert.assertStringIncludes(fitted, "## 5.0.0 - 2026-11-16\n");
    assert.assertStringIncludes(fitted, "[CHANGELOG.md](");
  },
);
