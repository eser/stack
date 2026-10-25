// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// etc/scripts belongs to no workspace package; the root package.json lists
// @eserstack/test-kit, so it resolves from the root node_modules.
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as distUtils from "./dist-utils.ts";

// --- repoRootFrom ---

nodeTest.test(
  "repoRootFrom: goes two levels up from the script directory",
  () => {
    assert.assertEquals(distUtils.repoRootFrom("/repo/etc/scripts"), "/repo");
  },
);

nodeTest.test("repoRootFrom: accepts Windows separators", () => {
  assert.assertEquals(
    distUtils.repoRootFrom("C:\\repo\\etc\\scripts"),
    "C:/repo",
  );
});

nodeTest.test(
  "repoRootFrom: throws when the script has no local directory",
  () => {
    assert.assertThrows(
      () => distUtils.repoRootFrom(undefined),
      Error,
      "import.meta.dirname is undefined",
    );
  },
);
