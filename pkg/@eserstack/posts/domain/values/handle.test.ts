// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as handleMod from "./handle.ts";

bdd.describe("toHandle", () => {
  bdd.describe("@ prefix stripping", () => {
    const cases = [
      { name: "strips leading @", input: "@eser", expected: "eser" },
      { name: "no @ — unchanged", input: "eser", expected: "eser" },
      { name: "only @ — strips to empty", input: "@", expected: "" },
    ];

    for (const { name, input, expected } of cases) {
      bdd.it(name, () => {
        assert.assertEquals(handleMod.toHandle(input), expected);
      });
    }
  });

  bdd.describe("lowercasing", () => {
    const cases = [
      { name: "uppercased handle", input: "ESER", expected: "eser" },
      {
        name: "mixed case handle",
        input: "EserOzvataf",
        expected: "eserozvataf",
      },
      { name: "already lowercase", input: "eser", expected: "eser" },
    ];

    for (const { name, input, expected } of cases) {
      bdd.it(name, () => {
        assert.assertEquals(handleMod.toHandle(input), expected);
      });
    }
  });

  bdd.describe("combined normalization", () => {
    const cases = [
      { name: "@ prefix + uppercase", input: "@ESER", expected: "eser" },
      {
        name: "Bluesky handle (no @)",
        input: "user.bsky.social",
        expected: "user.bsky.social",
      },
      {
        name: "Bluesky handle with @",
        input: "@User.Bsky.Social",
        expected: "user.bsky.social",
      },
      { name: "empty string", input: "", expected: "" },
    ];

    for (const { name, input, expected } of cases) {
      bdd.it(name, () => {
        assert.assertEquals(handleMod.toHandle(input), expected);
      });
    }
  });

  bdd.it("two calls with same input produce equal Handles", () => {
    const a = handleMod.toHandle("@eser");
    const b = handleMod.toHandle("@eser");
    assert.assertEquals(a, b);
  });
});
