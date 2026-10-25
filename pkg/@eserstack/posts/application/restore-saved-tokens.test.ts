// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import type { Platform } from "../domain/values/platform.ts";
import type { AuthProvider } from "./auth-provider.ts";
import * as restoreTokens from "./restore-saved-tokens.ts";
import * as testing from "./testing.ts";

const installedTokens = (auth: testing.MockAuthProvider) =>
  auth.calls.filter((call) => call.method === "setTokens").map((call) =>
    call.args[0]
  );

bdd.describe("restoreSavedTokens", () => {
  bdd.it(
    "installs the saved tokens of each platform that has them",
    async () => {
      const tokenStore = testing.createMockTokenStore();
      const twitter = testing.createMockAuthProvider();
      const bluesky = testing.createMockAuthProvider();
      const saved = testing.createTestTokens({ accessToken: "saved-bluesky" });
      tokenStore.store.set("bluesky", saved);

      const { restored, failures } = await restoreTokens.restoreSavedTokens(
        tokenStore,
        new Map<Platform, AuthProvider>([
          ["twitter", twitter],
          ["bluesky", bluesky],
        ]),
      );

      assert.assertEquals([...restored], [["bluesky", saved]]);
      assert.assertEquals(failures, []);
      assert.assertEquals(installedTokens(bluesky), [saved]);
      assert.assertEquals(installedTokens(twitter), []);
    },
  );

  bdd.it("leaves out tokens the provider cannot use", async () => {
    const tokenStore = testing.createMockTokenStore();
    // A Bluesky session saved without its DID cannot be restored.
    const auth = testing.createMockAuthProvider({
      isAuthenticated: () => false,
    });
    tokenStore.store.set("bluesky", testing.createTestTokens());

    const { restored } = await restoreTokens.restoreSavedTokens(
      tokenStore,
      new Map([["bluesky", auth]]),
    );

    assert.assertEquals(restored.size, 0);
  });

  bdd.it("reports a token store that fails to load", async () => {
    const tokenStore = {
      ...testing.createMockTokenStore(),
      load: () => Promise.reject(new Error("token file is not valid JSON")),
    };
    const auth = testing.createMockAuthProvider();

    const { restored, failures } = await restoreTokens.restoreSavedTokens(
      tokenStore,
      new Map([["twitter", auth]]),
    );

    assert.assertEquals(restored.size, 0);
    assert.assertEquals(
      failures.map(({ platform, error }) => [platform, error.message]),
      [["twitter", "token file is not valid JSON"]],
    );
    assert.assertEquals(installedTokens(auth), []);
  });
});
