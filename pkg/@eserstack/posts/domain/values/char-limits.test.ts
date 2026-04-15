// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as charLimitsMod from "./char-limits.ts";

bdd.describe("char-limits", () => {
  bdd.describe("getCharacterLimit", () => {
    const cases: Array<[charLimitsMod.CharacterLimitContext, number]> = [
      [{ platform: "twitter", subscriptionTier: "free" }, 280],
      [{ platform: "twitter", subscriptionTier: "premium" }, 280],
      [{ platform: "twitter", subscriptionTier: "premium_plus" }, 25_000],
      [{ platform: "twitter", subscriptionTier: "business" }, 25_000],
      [{ platform: "bluesky", subscriptionTier: "free" }, 300],
      [{ platform: "bluesky", subscriptionTier: "premium" }, 300],
      [{ platform: "bluesky", subscriptionTier: "premium_plus" }, 300],
      [{ platform: "bluesky", subscriptionTier: "business" }, 300],
    ];

    for (const [ctx, expected] of cases) {
      bdd.it(
        `should return ${expected} for ${ctx.platform}/${ctx.subscriptionTier}`,
        () => {
          assert.assertEquals(charLimitsMod.getCharacterLimit(ctx), expected);
        },
      );
    }
  });

  bdd.describe("getMinCharacterLimit", () => {
    bdd.it(
      "should return the most restrictive limit across multiple contexts",
      () => {
        const result = charLimitsMod.getMinCharacterLimit([
          { platform: "twitter", subscriptionTier: "premium_plus" }, // 25000
          { platform: "bluesky", subscriptionTier: "free" }, // 300
        ]);

        assert.assertEquals(result, 300);
      },
    );

    bdd.it("should return 280 when no contexts are provided", () => {
      assert.assertEquals(charLimitsMod.getMinCharacterLimit([]), 280);
    });

    bdd.it(
      "should return the single platform limit when one context given",
      () => {
        assert.assertEquals(
          charLimitsMod.getMinCharacterLimit([{
            platform: "twitter",
            subscriptionTier: "free",
          }]),
          280,
        );
      },
    );
  });

  bdd.describe("validatePostLength", () => {
    bdd.it("should be valid when text is within the limit", () => {
      const result = charLimitsMod.validatePostLength(
        "Hello world",
        { platform: "twitter", subscriptionTier: "free" },
      );

      assert.assertEquals(result.valid, true);
      assert.assertEquals(result.length, 11);
      assert.assertEquals(result.limit, 280);
      assert.assertEquals(result.remaining, 269);
    });

    bdd.it("should be invalid when text exceeds the limit", () => {
      const longText = "a".repeat(281);
      const result = charLimitsMod.validatePostLength(
        longText,
        { platform: "twitter", subscriptionTier: "free" },
      );

      assert.assertEquals(result.valid, false);
      assert.assertEquals(result.remaining, -1);
    });

    bdd.it("should be valid exactly at the limit", () => {
      const text = "a".repeat(280);
      const result = charLimitsMod.validatePostLength(
        text,
        { platform: "twitter", subscriptionTier: "free" },
      );

      assert.assertEquals(result.valid, true);
      assert.assertEquals(result.remaining, 0);
    });

    bdd.it("should use the correct limit for premium_plus", () => {
      const longText = "a".repeat(300);
      const result = charLimitsMod.validatePostLength(
        longText,
        { platform: "twitter", subscriptionTier: "premium_plus" },
      );

      assert.assertEquals(result.valid, true);
      assert.assertEquals(result.limit, 25_000);
    });
  });
});
