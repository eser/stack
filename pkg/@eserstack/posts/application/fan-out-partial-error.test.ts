// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as fanOutPartialError from "./fan-out-partial-error.ts";
import * as testing from "./testing.ts";

bdd.describe("FanOutPartialError", () => {
  bdd.it("names the platforms that published and the ones that failed", () => {
    const err = new fanOutPartialError.FanOutPartialError({
      posted: [testing.createTestPost({ platform: "twitter" })],
      failed: [{ platform: "bluesky", error: new Error("rate limited") }],
      totalPlatforms: 2,
    });

    assert.assertEquals(err.code, "FANOUT_PARTIAL");
    assert.assertEquals(err.name, "FanOutPartialError");
    assert.assertStringIncludes(err.message, "published on twitter");
    assert.assertStringIncludes(err.message, "bluesky (rate limited)");
    assert.assertStringIncludes(err.message, "1 of 2 platforms succeeded");
  });

  bdd.it("says nothing was published when every platform failed", () => {
    const err = new fanOutPartialError.FanOutPartialError({
      posted: [],
      failed: [
        { platform: "twitter", error: new Error("expired token") },
        { platform: "bluesky", error: new Error("rate limited") },
      ],
      totalPlatforms: 2,
    });

    assert.assertStringIncludes(err.message, "failed on all 2 platforms");
    assert.assertStringIncludes(err.message, "nothing was published");
    assert.assertStringIncludes(err.message, "twitter (expired token)");
    assert.assertStringIncludes(err.message, "bluesky (rate limited)");
  });

  bdd.it("keeps the posted posts and the failures", () => {
    const post = testing.createTestPost({ platform: "bluesky" });
    const failure = { platform: "twitter" as const, error: new Error("down") };

    const err = new fanOutPartialError.FanOutPartialError({
      posted: [post],
      failed: [failure],
      totalPlatforms: 2,
    });

    assert.assertInstanceOf(err, Error);
    assert.assertEquals(err.posted, [post]);
    assert.assertEquals(err.failed, [failure]);
    assert.assertEquals(err.totalPlatforms, 2);
  });
});
