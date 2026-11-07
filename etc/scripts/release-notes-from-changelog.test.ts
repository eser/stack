// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Runs the script the release-notes job runs, on a changelog a release wrote.
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";
import * as changelogGen from "../../pkg/@eserstack/codebase/changelog-gen.ts";

const script = path.join(
  import.meta.dirname,
  "release-notes-from-changelog.ts",
);

const before = `# Changelog

## Unreleased

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

const section = `## 5.0.0 - 2026-11-07

### Fixed

- **cli**: repair the thing (abc1234)
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
  const released = changelogGen.insertIntoChangelog(before, section, "5.0.0");

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
    const released = changelogGen.insertIntoChangelog(before, section, "5.0.0");
    const later = released.replace(
      "## Unreleased\n",
      "## Unreleased\n\n### Migration\n\n- a later step\n",
    );

    const notes = notesFor(later, "v5.0.0");

    assert.assertEquals(notes.includes("a later step"), false);
    assert.assertEquals(notes.includes("## Unreleased"), false);
  },
);
