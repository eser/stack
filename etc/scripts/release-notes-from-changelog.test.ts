// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Runs the script the release-notes job runs, on a changelog a release wrote.
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";

const script = path.join(
  import.meta.dirname,
  "release-notes-from-changelog.ts",
);

// What `eser codebase release` writes for 5.0.0 when the Unreleased section
// holds migration notes: the new section under an empty Unreleased, with the
// notes moved into it (codebasefx.InsertIntoChangelog). Go's
// TestReleasedChangelogReachesTheReleaseNotes runs this script on a release the
// Go eser plans.
const released = `# Changelog

## Unreleased

## 5.0.0 - 2026-11-07

### Fixed

- **cli**: repair the thing (abc1234)

### Migration

Upgrade with these steps.

- Run the new command:

  \`\`\`bash
  # Before
  old-command
  \`\`\`

## 4.5.2 - 2026-09-17

### Fixed

- an older fix (def5678)
`;

const notesFor = (changelog: string, tag: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eser-release-notes-"));
  try {
    fs.writeFileSync(path.join(dir, "CHANGELOG.md"), changelog);
    childProcess.execFileSync(
      crossRuntime.runtime.process.execPath(),
      [script, tag, path.join(dir, "notes.md")],
      { cwd: dir, stdio: "pipe" },
    );
    return fs.readFileSync(path.join(dir, "notes.md"), "utf8");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

nodeTest.test("the release notes carry the moved migration notes", () => {
  assert.assertEquals(
    notesFor(released, "v5.0.0"),
    `## 5.0.0 - 2026-11-07

### Fixed

- **cli**: repair the thing (abc1234)

### Migration

Upgrade with these steps.

- Run the new command:

  \`\`\`bash
  # Before
  old-command
  \`\`\`
`,
  );
});

nodeTest.test(
  "notes written after a release stay out of that release's notes",
  () => {
    const later = released.replace(
      "## Unreleased\n",
      "## Unreleased\n\n### Migration\n\n- a later step\n",
    );

    const notes = notesFor(later, "v5.0.0");

    assert.assertEquals(notes.includes("a later step"), false);
    assert.assertEquals(notes.includes("## Unreleased"), false);
  },
);

// GitHub refuses a release body over 125,000 characters, as the 5.0.0
// release did with its migration guide.
nodeTest.test("the release notes fit in a GitHub Release", () => {
  const guide = "- a migration step that takes a line\n".repeat(4_000);
  const changelog = `# Changelog\n\n## 5.0.0 - 2026-11-16\n\n### Fixed\n\n- **cli**: repair the thing (abc1234)\n\n### Migration\n\n${guide}`;
  const notes = notesFor(changelog, "v5.0.0");

  assert.assert(notes.length <= 125_000, `${notes.length} chars`);
  assert.assertStringIncludes(notes, "- **cli**: repair the thing");
  assert.assertStringIncludes(notes, "CHANGELOG.md");
});
