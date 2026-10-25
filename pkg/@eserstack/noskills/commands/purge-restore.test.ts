// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the argument handling of `noskills purge restore`. Restoring
 * itself runs end to end in purge.test.ts.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as purgeRestore from "./purge-restore.ts";

const ID = "2026-10-05T14-03-12-345Z";
const OLDER_ID = "2026-10-01T09-00-00-000Z";

bdd.describe("purgeRestore.parseRestoreArgs", () => {
  const accepted: readonly {
    name: string;
    args: readonly string[];
    expected: purgeRestore.RestoreRequest;
  }[] = [
    {
      name: "lists the history without arguments",
      args: [],
      expected: { entry: null, categories: null, overwrite: false },
    },
    {
      name: "restores every category of the named entry",
      args: [ID],
      expected: { entry: ID, categories: null, overwrite: false },
    },
    {
      name: "restores the named categories once each",
      args: ["latest", "specs", "rules", "specs"],
      expected: {
        entry: "latest",
        categories: ["specs", "rules"],
        overwrite: false,
      },
    },
    {
      name: "takes --overwrite anywhere",
      args: ["--overwrite", ID, "manifest"],
      expected: { entry: ID, categories: ["manifest"], overwrite: true },
    },
  ];

  for (const { name, args, expected } of accepted) {
    bdd.it(name, () => {
      const parsed = purgeRestore.parseRestoreArgs(args);

      assert.assertEquals(results.isOk(parsed), true);
      if (results.isOk(parsed)) {
        assert.assertEquals(parsed.value, expected);
      }
    });
  }

  const refused: readonly {
    name: string;
    args: readonly string[];
    mentions: string;
  }[] = [
    {
      name: "refuses a flag it does not know",
      args: [ID, "--force"],
      mentions: "--overwrite",
    },
    {
      name: "refuses an unknown category and lists the valid ones",
      args: [ID, "hooks"],
      mentions: "agent-integration",
    },
  ];

  for (const { name, args, mentions } of refused) {
    bdd.it(name, () => {
      const parsed = purgeRestore.parseRestoreArgs(args);

      assert.assertEquals(results.isFail(parsed), true);
      if (results.isFail(parsed)) {
        assert.assertInstanceOf(parsed.error, purgeRestore.RestoreArgsError);
        assert.assertStringIncludes(parsed.error.message, mentions);
      }
    });
  }
});

bdd.describe("purgeRestore.findEntry", () => {
  const entries = [
    { id: ID, categories: ["rules" as const] },
    { id: OLDER_ID, categories: ["specs" as const] },
  ];

  bdd.it("finds an entry by id", () => {
    assert.assertEquals(
      purgeRestore.findEntry(entries, OLDER_ID),
      entries[1],
    );
  });

  bdd.it("takes latest as the newest entry", () => {
    assert.assertEquals(purgeRestore.findEntry(entries, "latest"), entries[0]);
  });

  bdd.it("returns null for an id the history does not have", () => {
    assert.assertEquals(purgeRestore.findEntry(entries, "missing"), null);
    assert.assertEquals(purgeRestore.findEntry([], "latest"), null);
  });
});
