// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import { isTokenExpired } from "./token-utils.ts";
import { createTestTokens } from "./testing.ts";

bdd.describe("isTokenExpired", () => {
  bdd.it("treats tokens without expiresAt as non-expiring", () => {
    const tokens = createTestTokens({ expiresAt: undefined });
    assert.assertEquals(isTokenExpired(tokens), false);
  });

  bdd.it("returns false when token expires far in the future", () => {
    const tokens = createTestTokens({
      expiresAt: new Date(Date.now() + 10 * 60_000), // 10 minutes out
    });
    assert.assertEquals(isTokenExpired(tokens), false);
  });

  bdd.it(
    "returns true when token expires within the default 60 s buffer",
    () => {
      const tokens = createTestTokens({
        expiresAt: new Date(Date.now() + 30_000), // 30 s — inside the 60 s window
      });
      assert.assertEquals(isTokenExpired(tokens), true);
    },
  );

  bdd.it("returns true when token is already expired", () => {
    const tokens = createTestTokens({
      expiresAt: new Date(Date.now() - 1_000), // 1 s ago
    });
    assert.assertEquals(isTokenExpired(tokens), true);
  });

  bdd.it("respects a custom bufferMs override", () => {
    const tokens = createTestTokens({
      expiresAt: new Date(Date.now() + 5_000), // 5 s out
    });
    // With a 10 s buffer it should be expired; with 1 s buffer it should not.
    assert.assertEquals(isTokenExpired(tokens, 10_000), true);
    assert.assertEquals(isTokenExpired(tokens, 1_000), false);
  });
});
