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

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as releaseNotes from "./release-notes.ts";

// =============================================================================
// parseChangelogText — heading styles
// =============================================================================

nodeTest.test(
  "parseChangelogText reads a bare '## <version> - <date>' heading",
  () => {
    const entries = releaseNotes.parseChangelogText(
      ["## 4.3.0 - 2026-08-08", "", "- feat(cli): add a thing", ""].join("\n"),
    );

    assert.assertEquals(entries.length, 1);
    assert.assertEquals(entries[0]!.version, "4.3.0");
    assert.assertEquals(entries[0]!.tag, "v4.3.0");
    assert.assertEquals(entries[0]!.date, "2026-08-08");
  },
);

nodeTest.test(
  "parseChangelogText reads a bracketed '## [<version>] - <date>' heading",
  () => {
    const entries = releaseNotes.parseChangelogText(
      ["## [4.1.0] - 2025-01-01", "", "- fix: an older thing", ""].join("\n"),
    );

    assert.assertEquals(entries.length, 1);
    assert.assertEquals(entries[0]!.version, "4.1.0");
    assert.assertEquals(entries[0]!.tag, "v4.1.0");
    assert.assertEquals(entries[0]!.date, "2025-01-01");
  },
);

// The regression that emptied the v4.3.0 release notes: the `v` inside the
// brackets survived into the version string, the `^\d` guard below the match
// then read it as a non-version heading like [Unreleased], and the section
// vanished from the parse entirely.
nodeTest.test(
  "parseChangelogText reads a v-prefixed '## [v<version>]' heading",
  () => {
    const entries = releaseNotes.parseChangelogText(
      [
        "## [v4.1.61] - 2025-01-01",
        "",
        "- fix: a legacy-style section",
        "",
      ].join("\n"),
    );

    assert.assertEquals(entries.length, 1);
    assert.assertEquals(entries[0]!.version, "4.1.61");
    assert.assertEquals(entries[0]!.tag, "v4.1.61");
    assert.assertEquals(entries[0]!.date, "2025-01-01");
  },
);

nodeTest.test(
  "parseChangelogText keeps all three heading styles in file order",
  () => {
    const entries = releaseNotes.parseChangelogText(
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

    assert.assertEquals(
      entries.map((entry) => entry.tag),
      ["v4.3.0", "v4.2.0", "v4.1.61"],
    );
  },
);

// =============================================================================
// parseChangelogText — non-version headings
// =============================================================================

nodeTest.test(
  "parseChangelogText skips Unreleased in both heading styles",
  () => {
    const entries = releaseNotes.parseChangelogText(
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

    assert.assertEquals(
      entries.map((entry) => entry.version),
      ["4.3.0"],
    );
  },
);

// =============================================================================
// parseChangelogText — notes body
// =============================================================================

nodeTest.test(
  "parseChangelogText captures the body between two headings",
  () => {
    const entries = releaseNotes.parseChangelogText(
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

    assert.assertEquals(entries.length, 2);
    assert.assertEquals(
      entries[0]!.notes,
      "## 4.3.0 - 2026-08-08\n\n### Features\n\n- add a thing\n",
    );
    assert.assertEquals(
      entries[1]!.notes,
      "## 4.2.0 - 2026-07-01\n\n- an older thing\n",
    );
  },
);

// The rendered heading drops the legacy `v`, so notes read the same regardless
// of which generator wrote the section.
nodeTest.test(
  "parseChangelogText renders a v-prefixed section under its bare version",
  () => {
    const entries = releaseNotes.parseChangelogText(
      ["## [v4.1.61] - 2025-01-01", "", "- a legacy-style section", ""].join(
        "\n",
      ),
    );

    assert.assertEquals(
      entries[0]!.notes,
      "## 4.1.61 - 2025-01-01\n\n- a legacy-style section\n",
    );
  },
);

nodeTest.test(
  "parseChangelogText returns no entries when nothing is a version",
  () => {
    assert.assertEquals(
      releaseNotes.parseChangelogText(
        "# Changelog\n\n## [Unreleased]\n\n- soon\n",
      ),
      [],
    );
  },
);

// =============================================================================
// normalizeTag
// =============================================================================

nodeTest.test(
  "normalizeTag adds the v prefix, keeps it, and strips refs/tags/",
  () => {
    // The three shapes a tag arrives in: a VERSION file read, a hand-typed
    // --tag, and GITHUB_REF from a tag-triggered workflow.
    assert.assertEquals(releaseNotes.normalizeTag("4.3.0"), "v4.3.0");
    assert.assertEquals(releaseNotes.normalizeTag("v4.3.0"), "v4.3.0");
    assert.assertEquals(
      releaseNotes.normalizeTag("refs/tags/v4.3.0"),
      "v4.3.0",
    );
    assert.assertEquals(releaseNotes.normalizeTag("  v4.3.0  "), "v4.3.0");
  },
);

nodeTest.test(
  "parseCliArgs reads --repo, --tag and --create-if-missing",
  () => {
    const event = releaseNotes.parseCliArgs([
      "--repo",
      "eser/stack",
      "--tag=v4.5.2",
      "--create-if-missing",
    ]);

    assert.assertEquals(event.flags["repo"], "eser/stack");
    assert.assertEquals(event.flags["tag"], "v4.5.2");
    assert.assertEquals(event.flags["create-if-missing"], true);
  },
);

nodeTest.test("parseCliArgs leaves absent flags out and maps -h", () => {
  const event = releaseNotes.parseCliArgs(["-h"]);

  assert.assertEquals(event.flags["help"], true);
  assert.assertEquals(event.flags["repo"], undefined);
  assert.assertEquals(event.flags["create-if-missing"], undefined);
});

// =============================================================================
// syncReleaseNotes — the gh calls
// =============================================================================

const CHANGELOG = [
  "# Changelog",
  "",
  "## 1.2.4 - 2026-02-02",
  "",
  "- a fix",
  "",
  "## [v1.2.3] - 2026-01-01",
  "",
  "- first",
  "",
].join("\n");

/**
 * A gh that records each call and never reaches GitHub. `release view`
 * succeeds once `exists` is set; `fails` names the subcommands that reject.
 * The notes file path is temporary, so a call records "<notes-file>" in its
 * place and keeps the file's text in `notes`.
 */
const fakeGh = (state: { exists: boolean; fails?: ReadonlySet<string> }) => {
  const calls: string[][] = [];
  const notes: string[] = [];

  const gh: releaseNotes.GhRunner = async (args) => {
    const recorded = [...args];
    const fileIndex = recorded.indexOf("--notes-file") + 1;

    if (fileIndex > 0) {
      notes.push(await runtime.fs.readTextFile(recorded[fileIndex]!));
      recorded[fileIndex] = "<notes-file>";
    }

    calls.push(recorded);

    if (state.fails?.has(args[1]!) === true) {
      throw new Error(`gh release ${args[1]} failed`);
    }

    if (args[1] === "view" && !state.exists) {
      throw new Error("release not found");
    }
  };

  return { gh, calls, notes };
};

const withChangelog = async (
  run: (root: string) => Promise<void>,
): Promise<void> => {
  const root = await runtime.fs.makeTempDir({ prefix: "release-notes-test-" });

  try {
    await runtime.fs.writeTextFile(
      runtime.path.join(root, "CHANGELOG.md"),
      CHANGELOG,
    );
    await run(root);
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
};

// The release run publishes a created release once its archives are attached,
// so releases/latest never names a release without them (TASK-376). The
// arguments are the ones the Go SyncReleaseNotes sends (pkg/ajan/codebasefx).
nodeTest.test(
  "syncReleaseNotes creates a missing release as a draft, with the arguments of the Go twin",
  async () => {
    await withChangelog(async (root) => {
      const fake = fakeGh({ exists: false });

      const result = await releaseNotes.syncReleaseNotes(
        { repo: "eser/stack", tag: "1.2.3", createIfMissing: true, root },
        fake.gh,
      );

      assert.assertEquals(result.action, "created");
      assert.assertEquals(result.tag, "v1.2.3");
      assert.assertEquals(fake.calls, [
        ["release", "view", "v1.2.3", "--repo", "eser/stack"],
        [
          "release",
          "create",
          "v1.2.3",
          "--repo",
          "eser/stack",
          "--title",
          "eserstack v1.2.3",
          "--draft",
          "--notes-file",
          "<notes-file>",
        ],
      ]);
      assert.assertEquals(fake.notes, ["## 1.2.3 - 2026-01-01\n\n- first\n"]);
    });
  },
);

nodeTest.test(
  "syncReleaseNotes skips a missing release unless asked to create it",
  async () => {
    await withChangelog(async (root) => {
      const fake = fakeGh({ exists: false });

      const result = await releaseNotes.syncReleaseNotes(
        { repo: "eser/stack", root },
        fake.gh,
      );

      assert.assertEquals(result.action, "skipped");
      assert.assertEquals(result.tag, "v1.2.4");
      assert.assertEquals(fake.calls, [
        ["release", "view", "v1.2.4", "--repo", "eser/stack"],
      ]);
    });
  },
);

// An edit changes the notes only: it never turns a published release back into
// a draft, nor publishes a draft.
nodeTest.test(
  "syncReleaseNotes edits only the notes of an existing release",
  async () => {
    await withChangelog(async (root) => {
      const fake = fakeGh({ exists: true });

      const result = await releaseNotes.syncReleaseNotes(
        { repo: "eser/stack", tag: "v1.2.4", createIfMissing: true, root },
        fake.gh,
      );

      assert.assertEquals(result.action, "updated");
      assert.assertEquals(fake.calls, [
        ["release", "view", "v1.2.4", "--repo", "eser/stack"],
        [
          "release",
          "edit",
          "v1.2.4",
          "--repo",
          "eser/stack",
          "--notes-file",
          "<notes-file>",
        ],
      ]);
      assert.assertEquals(fake.notes, ["## 1.2.4 - 2026-02-02\n\n- a fix\n"]);
    });
  },
);

// Someone else created the release between the check and the create: the
// fallback edits the notes of that release and leaves its draft state alone.
nodeTest.test(
  "syncReleaseNotes edits only the notes when a create loses the race",
  async () => {
    await withChangelog(async (root) => {
      const state = { exists: false, fails: new Set(["create"]) };
      const fake = fakeGh(state);
      const gh: releaseNotes.GhRunner = async (args) => {
        try {
          await fake.gh(args);
        } finally {
          if (args[1] === "create") {
            state.exists = true;
          }
        }
      };

      const result = await releaseNotes.syncReleaseNotes(
        { repo: "eser/stack", tag: "v1.2.4", createIfMissing: true, root },
        gh,
      );

      assert.assertEquals(result.action, "updated");
      assert.assertEquals(fake.calls.slice(2), [
        ["release", "view", "v1.2.4", "--repo", "eser/stack"],
        [
          "release",
          "edit",
          "v1.2.4",
          "--repo",
          "eser/stack",
          "--notes-file",
          "<notes-file>",
        ],
      ]);
    });
  },
);
