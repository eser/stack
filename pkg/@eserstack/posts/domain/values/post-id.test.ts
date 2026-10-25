// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as handleMod from "./handle.ts";
import * as postIdMod from "./post-id.ts";

bdd.describe("toPostId", () => {
  // toPostId is a pure cast — it does NOT validate, normalize, or trim.
  // It exists only to enforce the branded type at construction sites.

  const cases = [
    {
      name: "Twitter numeric ID",
      input: "1234567890",
      expected: "1234567890",
    },
    {
      name: "Bluesky AT URI",
      input: "at://did:plc:xyz123/app.bsky.feed.post/abc456",
      expected: "at://did:plc:xyz123/app.bsky.feed.post/abc456",
    },
    {
      name: "preserves whitespace (no trimming — pure cast)",
      input: "  spaced  ",
      expected: "  spaced  ",
    },
    {
      name: "empty string",
      input: "",
      expected: "",
    },
  ];

  for (const { name, input, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(postIdMod.toPostId(input), expected);
    });
  }

  bdd.it("two calls with same input produce equal PostIds", () => {
    const a = postIdMod.toPostId("same-id");
    const b = postIdMod.toPostId("same-id");
    assert.assertEquals(a, b);
  });

  bdd.it("two calls with different inputs produce unequal PostIds", () => {
    const a = postIdMod.toPostId("id-one");
    const b = postIdMod.toPostId("id-two");
    assert.assertEquals(a === b, false);
  });

  bdd.it(
    "keeps plain strings and Handles out of PostId at compile time",
    () => {
      // The brand is type-only; deno check fails if either line compiles.
      // @ts-expect-error: a plain string is not a PostId
      const fromString: postIdMod.PostId = "123";
      // @ts-expect-error: a Handle is not a PostId
      const fromHandle: postIdMod.PostId = handleMod.toHandle("someone");

      assert.assertEquals([fromString, fromHandle], ["123", "someone"]);
    },
  );
});
