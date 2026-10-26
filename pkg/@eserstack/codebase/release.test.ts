// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as release from "./release.ts";

nodeTest.test(
  "parseReleaseArgs reads the bump type, --dry-run and --yes",
  () => {
    const event = release.parseReleaseArgs(["minor", "--dry-run", "--yes"]);

    assert.assertEquals(event.command, "release");
    assert.assertEquals(event.args, ["minor"]);
    assert.assertEquals(event.flags["dry-run"], true);
    assert.assertEquals(event.flags["yes"], true);
  },
);

nodeTest.test("parseReleaseArgs reads the -n and -y aliases", () => {
  const event = release.parseReleaseArgs(["-n", "-y", "patch"]);

  assert.assertEquals(event.args, ["patch"]);
  assert.assertEquals(event.flags["dry-run"], true);
  assert.assertEquals(event.flags["yes"], true);
});

nodeTest.test("parseReleaseArgs leaves absent flags out", () => {
  const event = release.parseReleaseArgs(["major"]);

  assert.assertEquals(event.flags["dry-run"], undefined);
  assert.assertEquals(event.flags["yes"], undefined);
});

nodeTest.test(
  "parseRereleaseArgs reads --dry-run, --yes and their aliases",
  () => {
    assert.assertEquals(
      release.parseRereleaseArgs(["-n"]).flags["dry-run"],
      true,
    );
    assert.assertEquals(
      release.parseRereleaseArgs(["--yes"]).flags["yes"],
      true,
    );
    assert.assertEquals(release.parseRereleaseArgs([]).command, "rerelease");
  },
);

nodeTest.test("parseUnreleaseArgs reads --yes and -y", () => {
  assert.assertEquals(release.parseUnreleaseArgs(["-y"]).flags["yes"], true);
  assert.assertEquals(release.parseUnreleaseArgs(["--yes"]).flags["yes"], true);
  assert.assertEquals(release.parseUnreleaseArgs([]).flags["yes"], undefined);
});
