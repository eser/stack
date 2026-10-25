// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import type { Platform } from "../../../domain/values/platform.ts";
import type { AuthProvider } from "../../../application/auth-provider.ts";
import * as testing from "../../../application/testing.ts";
import * as status from "./status.ts";

/** Providers that report a session only once tokens are installed. */
const createSessionAuth = (requiresBrowser: boolean) => {
  let installed = false;
  return testing.createMockAuthProvider({
    requiresBrowser,
    isAuthenticated: () => installed,
    setTokens: () => {
      installed = true;
    },
  });
};

const createAuths = () =>
  new Map<Platform, AuthProvider>([
    ["twitter", createSessionAuth(true)],
    ["bluesky", createSessionAuth(false)],
  ]);

bdd.describe("readPlatformStatuses", () => {
  bdd.it("reports a platform with saved tokens as authenticated", async () => {
    const tokenStore = testing.createMockTokenStore();
    tokenStore.store.set("bluesky", testing.createTestTokens());

    const statuses = await status.readPlatformStatuses(
      createAuths(),
      tokenStore,
    );

    assert.assertEquals(statuses, [
      {
        platform: "twitter",
        flow: "browser",
        state: "not authenticated",
        detail: null,
      },
      {
        platform: "bluesky",
        flow: "credentials",
        state: "authenticated",
        detail: null,
      },
    ]);
  });

  bdd.it("reports why the saved tokens could not be read", async () => {
    const tokenStore = {
      ...testing.createMockTokenStore(),
      load: () => Promise.reject(new Error("token file is not valid JSON")),
    };

    const statuses = await status.readPlatformStatuses(
      createAuths(),
      tokenStore,
    );

    assert.assertEquals(
      statuses.map(({ state, detail }) => [state, detail]),
      [
        ["unreadable", "token file is not valid JSON"],
        ["unreadable", "token file is not valid JSON"],
      ],
    );
  });
});
