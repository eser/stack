// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the purge history: entry ids, the entry limit, and keeping and
 * restoring each kind of content in a temporary project.
 */

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as yaml from "yaml";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as purgeHistory from "./purge-history.ts";

// 2026-10-05T14:03:12.345Z
const NOW = Date.UTC(2026, 9, 5, 14, 3, 12, 345);
const ID = "2026-10-05T14-03-12-345Z";

const writeFile = async (path: string, content: string): Promise<void> => {
  await runtime.fs.mkdir(runtime.path.dirname(path), { recursive: true });
  await runtime.fs.writeTextFile(path, content);
};

// =============================================================================
// Entry ids
// =============================================================================

bdd.describe("purgeHistory.entryIdFor", () => {
  const cases: readonly {
    name: string;
    taken: readonly string[];
    expected: string;
  }[] = [
    {
      name: "writes the UTC time without characters Windows refuses",
      taken: [],
      expected: ID,
    },
    {
      name: "adds -2 when a purge in the same millisecond has the id",
      taken: [ID],
      expected: `${ID}-2`,
    },
    {
      name: "takes the first free suffix",
      taken: [ID, `${ID}-2`],
      expected: `${ID}-3`,
    },
  ];

  for (const { name, taken, expected } of cases) {
    bdd.it(name, () => {
      const id = purgeHistory.entryIdFor(NOW, new Set(taken));

      assert.assertEquals(id, expected);
      assert.assertEquals(purgeHistory.isEntryId(id), true);
    });
  }
});

bdd.describe("purgeHistory.isEntryId", () => {
  const cases: readonly { name: string; value: string; expected: boolean }[] = [
    { name: "accepts an id", value: ID, expected: true },
    { name: "accepts a suffixed id", value: `${ID}-12`, expected: true },
    { name: "refuses a suffix of 1", value: `${ID}-1`, expected: false },
    {
      name: "refuses an ISO time with colons",
      value: "2026-10-05T14:03:12.345Z",
      expected: false,
    },
    { name: "refuses a path", value: `../${ID}`, expected: false },
    { name: "refuses another folder", value: "notes", expected: false },
  ];

  for (const { name, value, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(purgeHistory.isEntryId(value), expected);
    });
  }
});

bdd.describe("purgeHistory.entriesBeyondLimit", () => {
  bdd.it("drops the oldest ids so the newest five remain", () => {
    const ids = [
      "2026-10-05T14-03-12-345Z-10",
      "2026-10-01T00-00-00-000Z",
      "2026-10-05T14-03-12-345Z",
      "2026-10-03T00-00-00-000Z",
      "2026-10-05T14-03-12-345Z-2",
      "2026-10-02T00-00-00-000Z",
      "2026-10-04T00-00-00-000Z",
    ];

    assert.assertEquals(
      purgeHistory.entriesBeyondLimit(ids, purgeHistory.PURGE_HISTORY_LIMIT),
      ["2026-10-01T00-00-00-000Z", "2026-10-02T00-00-00-000Z"],
    );
  });

  bdd.it("orders suffixes by number, not by text", () => {
    const ids = [`${ID}-10`, `${ID}-2`, ID];

    assert.assertEquals([...ids].sort(purgeHistory.compareEntryIds), [
      ID,
      `${ID}-2`,
      `${ID}-10`,
    ]);
  });

  bdd.it("drops nothing at or below the limit", () => {
    assert.assertEquals(purgeHistory.entriesBeyondLimit([ID], 5), []);
    assert.assertEquals(purgeHistory.entriesBeyondLimit([], 5), []);
  });
});

bdd.describe("purgeHistory.describeError", () => {
  bdd.it("joins the messages of the cause chain", () => {
    const error = new purgeHistory.PurgeHistoryError(
      ID,
      "keep .eser/rules in purge history entry",
      { cause: new Error("permission denied") },
    );

    assert.assertEquals(
      purgeHistory.describeError(error),
      "keep .eser/rules in purge history entry: permission denied",
    );
    assert.assertEquals(purgeHistory.describeError("plain"), "plain");
  });
});

// =============================================================================
// Keeping and restoring
// =============================================================================

bdd.describe("purgeHistory: keeping and restoring", () => {
  let root: string;

  bdd.beforeEach(async () => {
    root = await runtime.fs.makeTempDir({ prefix: "nos_history_" });
  });

  bdd.afterEach(async () => {
    await runtime.fs.remove(root, { recursive: true });
  });

  bdd.it("lists nothing when no purge kept anything", async () => {
    assert.assertEquals(await purgeHistory.listEntries(root), []);
    assert.assertEquals(await purgeHistory.newEntryId(root, NOW), ID);
  });

  bdd.it(
    "moves a folder into the entry and copies it back, keeping the entry",
    async () => {
      await writeFile(`${root}/.eser/rules/a.md`, "rule a");
      await writeFile(`${root}/.eser/rules/nested/b.md`, "rule b");

      await purgeHistory.keepPath(root, ID, "rules", ".eser/rules");

      assert.assertEquals(
        await runtime.fs.exists(`${root}/.eser/rules`),
        false,
      );
      assert.assertEquals(
        await runtime.fs.readTextFile(
          `${root}/${purgeHistory.entryPath(ID)}/rules/.eser/rules/nested/b.md`,
        ),
        "rule b",
      );
      assert.assertEquals(await purgeHistory.listEntries(root), [
        { id: ID, categories: ["rules"] },
      ]);

      const outcome = await purgeHistory.restorePaths(root, ID, "rules", {
        overwrite: false,
      });

      assert.assertEquals(outcome.status, "restored");
      if (outcome.status === "restored") {
        assert.assertEquals([...outcome.paths].sort(), [
          ".eser/rules/a.md",
          ".eser/rules/nested/b.md",
        ]);
      }
      assert.assertEquals(
        await runtime.fs.readTextFile(`${root}/.eser/rules/a.md`),
        "rule a",
      );
      // The entry keeps its copy, so the restore can run again.
      assert.assertEquals(await purgeHistory.listEntries(root), [
        { id: ID, categories: ["rules"] },
      ]);
    },
  );

  bdd.it(
    "refuses to replace existing files and replaces them with overwrite",
    async () => {
      await writeFile(`${root}/.eser/rules/a.md`, "kept rule");
      await purgeHistory.keepPath(root, ID, "rules", ".eser/rules");
      await writeFile(`${root}/.eser/rules/a.md`, "new rule");
      await writeFile(`${root}/.eser/rules/other.md`, "other rule");

      const refused = await purgeHistory.restorePaths(root, ID, "rules", {
        overwrite: false,
      });

      assert.assertEquals(refused, {
        status: "refused",
        conflicts: [".eser/rules/a.md"],
      });
      assert.assertEquals(
        await runtime.fs.readTextFile(`${root}/.eser/rules/a.md`),
        "new rule",
      );

      const replaced = await purgeHistory.restorePaths(root, ID, "rules", {
        overwrite: true,
      });

      assert.assertEquals(replaced.status, "restored");
      assert.assertEquals(
        await runtime.fs.readTextFile(`${root}/.eser/rules/a.md`),
        "kept rule",
      );
      // Files the entry does not hold stay.
      assert.assertEquals(
        await runtime.fs.readTextFile(`${root}/.eser/rules/other.md`),
        "other rule",
      );
    },
  );

  bdd.it(
    "restores the files of a category that spans two folders",
    async () => {
      await writeFile(`${root}/.eser/specs/s/spec.md`, "# s");
      await writeFile(`${root}/.eser/.state/progresses/state.json`, "{}");
      await Promise.all(
        purgeHistory.CATEGORY_PATHS.specs.map((path) =>
          purgeHistory.keepPath(root, ID, "specs", path),
        ),
      );

      const outcome = await purgeHistory.restorePaths(root, ID, "specs", {
        overwrite: false,
      });

      assert.assertEquals(outcome.status, "restored");
      assert.assertEquals(
        await runtime.fs.readTextFile(`${root}/.eser/specs/s/spec.md`),
        "# s",
      );
      assert.assertEquals(
        await runtime.fs.readTextFile(
          `${root}/.eser/.state/progresses/state.json`,
        ),
        "{}",
      );
    },
  );

  bdd.it("brings back a folder that held no files", async () => {
    await runtime.fs.mkdir(`${root}/.eser/concerns`, { recursive: true });
    await purgeHistory.keepPath(root, ID, "concerns", ".eser/concerns");

    const outcome = await purgeHistory.restorePaths(root, ID, "concerns", {
      overwrite: false,
    });

    assert.assertEquals(outcome, {
      status: "restored",
      paths: [],
      skipped: [],
    });
    assert.assertEquals(
      (await runtime.fs.stat(`${root}/.eser/concerns`)).isDirectory,
      true,
    );
  });

  bdd.it("records a category that has no files", async () => {
    await purgeHistory.markCategory(root, ID, "agent-integration");

    assert.assertEquals(await purgeHistory.listEntries(root), [
      { id: ID, categories: ["agent-integration"] },
    ]);

    const outcome = await purgeHistory.restorePaths(
      root,
      ID,
      "agent-integration",
      { overwrite: false },
    );

    assert.assertEquals(outcome, {
      status: "restored",
      paths: [],
      skipped: [],
    });
  });

  bdd.it("keeps the noskills section and puts it back", async () => {
    const manifest = yaml.parseDocument(
      "precommit:\n  validators: [fmt]\nnoskills:\n  # chosen at init\n  concerns: [open-source]\n",
    );
    await purgeHistory.keepManifestSection(
      root,
      ID,
      manifest.get("noskills", true),
    );
    await writeFile(`${root}/.eser/manifest.yml`, "precommit:\n  ok: true\n");

    const outcome = await purgeHistory.restoreManifestSection(root, ID, {
      overwrite: false,
    });

    assert.assertEquals(outcome, {
      status: "restored",
      paths: [".eser/manifest.yml"],
      skipped: [],
    });
    const restored = await runtime.fs.readTextFile(
      `${root}/.eser/manifest.yml`,
    );
    assert.assertStringIncludes(restored, "precommit:");
    assert.assertStringIncludes(restored, "# chosen at init");
    assert.assertEquals(yaml.parse(restored).noskills, {
      concerns: ["open-source"],
    });
    assert.assertEquals(await purgeHistory.listEntries(root), [
      { id: ID, categories: ["manifest"] },
    ]);
  });

  bdd.it("creates the manifest when the project has none", async () => {
    const section = yaml.parseDocument("noskills:\n  tools: [cursor]\n");
    await purgeHistory.keepManifestSection(
      root,
      ID,
      section.get("noskills", true),
    );

    await purgeHistory.restoreManifestSection(root, ID, {
      overwrite: false,
    });

    assert.assertEquals(
      yaml.parse(await runtime.fs.readTextFile(`${root}/.eser/manifest.yml`)),
      { noskills: { tools: ["cursor"] } },
    );
  });

  bdd.it(
    "writes the section as a block when purge left an empty manifest",
    async () => {
      const section = yaml.parseDocument("noskills:\n  tools:\n    - cursor\n");
      await purgeHistory.keepManifestSection(
        root,
        ID,
        section.get("noskills", true),
      );
      await writeFile(`${root}/.eser/manifest.yml`, "{}\n");

      await purgeHistory.restoreManifestSection(root, ID, {
        overwrite: false,
      });

      assert.assertEquals(
        await runtime.fs.readTextFile(`${root}/.eser/manifest.yml`),
        "noskills:\n  tools:\n    - cursor\n",
      );
    },
  );

  bdd.it("refuses to replace a noskills section unless asked", async () => {
    const section = yaml.parseDocument("noskills:\n  tools: [cursor]\n");
    await purgeHistory.keepManifestSection(
      root,
      ID,
      section.get("noskills", true),
    );
    await writeFile(
      `${root}/.eser/manifest.yml`,
      "noskills:\n  tools: [kiro]\n",
    );

    const refused = await purgeHistory.restoreManifestSection(root, ID, {
      overwrite: false,
    });

    assert.assertEquals(refused, {
      status: "refused",
      conflicts: [".eser/manifest.yml (noskills section)"],
    });
    assert.assertEquals(
      yaml.parse(await runtime.fs.readTextFile(`${root}/.eser/manifest.yml`)),
      { noskills: { tools: ["kiro"] } },
    );

    await purgeHistory.restoreManifestSection(root, ID, { overwrite: true });

    assert.assertEquals(
      yaml.parse(await runtime.fs.readTextFile(`${root}/.eser/manifest.yml`)),
      { noskills: { tools: ["cursor"] } },
    );
  });

  bdd.it("names the entry when its manifest copy is unreadable", async () => {
    await writeFile(
      `${root}/${purgeHistory.entryPath(ID)}/manifest/noskills.yml`,
      "noskills: [unclosed\n",
    );

    const error = await assert.assertRejects(
      () => purgeHistory.restoreManifestSection(root, ID, { overwrite: true }),
      purgeHistory.PurgeHistoryError,
    );

    assert.assertStringIncludes(error.message, ID);
    assert.assertStringIncludes(error.message, "noskills init");
  });

  bdd.it(
    "drops the oldest entries beyond the limit and nothing else",
    async () => {
      const ids = [0, 1, 2, 3, 4, 5, 6].map((day) =>
        purgeHistory.entryIdFor(NOW + day * 86_400_000, new Set()),
      );
      await Promise.all(
        [
          ...ids.map((id) => purgeHistory.entryPath(id)),
          ".eser/.state/purge-history/notes",
        ].map((path) =>
          runtime.fs.mkdir(`${root}/${path}`, { recursive: true }),
        ),
      );

      const dropped = await purgeHistory.pruneHistory(
        root,
        purgeHistory.PURGE_HISTORY_LIMIT,
      );

      assert.assertEquals(dropped, ids.slice(0, 2));
      assert.assertEquals(
        (await purgeHistory.listEntries(root)).map((entry) => entry.id),
        ids.slice(2).reverse(),
      );
      // A folder that is not an entry stays.
      assert.assertEquals(
        await runtime.fs.exists(`${root}/.eser/.state/purge-history/notes`),
        true,
      );
    },
  );
});
