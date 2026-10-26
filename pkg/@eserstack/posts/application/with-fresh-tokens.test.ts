// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import type { Platform } from "../domain/values/platform.ts";
import * as authRequiredError from "./auth-required-error.ts";
import type { InboundPostService } from "./post-service.ts";
import * as testing from "./testing.ts";
import * as withFreshTokens from "./with-fresh-tokens.ts";

const platform: Platform = "twitter";
// Minimal stand-in — withFreshTokens never touches postService directly.
const noopPostService = {} as InboundPostService;

bdd.describe("withFreshTokens", () => {
  bdd.it(
    "happy path: installs valid tokens and saves them after the operation",
    async () => {
      const tokenStore = testing.createMockTokenStore();
      const auth = testing.createMockAuthProvider();
      const tokens = testing.createTestTokens();
      tokenStore.store.set(platform, tokens);

      const ctx = {
        postService: noopPostService,
        tokenStore,
        auths: new Map([[platform, auth]]),
      };

      const result = await withFreshTokens.withFreshTokens(ctx, platform, () =>
        Promise.resolve(results.ok("done")),
      );

      assert.assertEquals(results.isOk(result), true);
      assert.assertEquals(
        auth.calls.some((c) => c.method === "setTokens"),
        true,
      );
      assert.assertEquals(
        tokenStore.calls.some((c) => c.method === "save"),
        true,
      );
    },
  );

  bdd.it(
    "refreshes an expired token and saves the refreshed tokens",
    async () => {
      const tokenStore = testing.createMockTokenStore();
      const refreshedTokens = testing.createTestTokens({
        accessToken: "refreshed-token",
      });
      const auth = testing.createMockAuthProvider({
        refreshToken: () => Promise.resolve(refreshedTokens),
      });
      const expiredTokens = testing.createTestTokens({
        expiresAt: new Date(Date.now() - 1_000), // already expired
      });
      tokenStore.store.set(platform, expiredTokens);

      const ctx = {
        postService: noopPostService,
        tokenStore,
        auths: new Map([[platform, auth]]),
      };

      let installedTokens;
      const result = await withFreshTokens.withFreshTokens(
        ctx,
        platform,
        () => {
          installedTokens = auth.calls
            .filter((c) => c.method === "setTokens")
            .at(-1)?.args[0];
          return Promise.resolve(results.ok("done"));
        },
      );

      assert.assertEquals(results.isOk(result), true);
      assert.assertEquals(installedTokens, refreshedTokens);
      const savedCall = tokenStore.calls.find((c) => c.method === "save");
      assert.assertExists(savedCall);
      assert.assertEquals(savedCall.args[1], refreshedTokens);
    },
  );

  bdd.it("saves tokens even when the operation fails", async () => {
    const tokenStore = testing.createMockTokenStore();
    const auth = testing.createMockAuthProvider();
    tokenStore.store.set(platform, testing.createTestTokens());

    const ctx = {
      postService: noopPostService,
      tokenStore,
      auths: new Map([[platform, auth]]),
    };

    const err = new Error("API error");
    const result = await withFreshTokens.withFreshTokens(ctx, platform, () =>
      Promise.resolve(results.fail(err)),
    );

    assert.assertEquals(results.isFail(result), true);
    assert.assertEquals(
      tokenStore.calls.some((c) => c.method === "save"),
      true,
      "release must save tokens even after a failing operation",
    );
  });

  bdd.it("returns AuthRequiredError when no tokens are stored", async () => {
    const tokenStore = testing.createMockTokenStore(); // store is empty
    const auth = testing.createMockAuthProvider();

    const ctx = {
      postService: noopPostService,
      tokenStore,
      auths: new Map([[platform, auth]]),
    };

    const result = await withFreshTokens.withFreshTokens(ctx, platform, () =>
      Promise.resolve(results.ok("never")),
    );

    assert.assertEquals(results.isFail(result), true);
    assert.assertInstanceOf(
      results.isFail(result) ? result.error : null,
      authRequiredError.AuthRequiredError,
    );
  });

  bdd.it(
    "returns AuthRequiredError when token is expired and has no refresh token",
    async () => {
      const tokenStore = testing.createMockTokenStore();
      const auth = testing.createMockAuthProvider();
      tokenStore.store.set(
        platform,
        testing.createTestTokens({
          expiresAt: new Date(Date.now() - 1_000),
          refreshToken: undefined,
        }),
      );

      const ctx = {
        postService: noopPostService,
        tokenStore,
        auths: new Map([[platform, auth]]),
      };

      const result = await withFreshTokens.withFreshTokens(ctx, platform, () =>
        Promise.resolve(results.ok("never")),
      );

      assert.assertEquals(results.isFail(result), true);
      assert.assertInstanceOf(
        results.isFail(result) ? result.error : null,
        authRequiredError.AuthRequiredError,
      );
      assert.assertEquals(
        tokenStore.calls.some((c) => c.method === "save"),
        false,
        "save must NOT be called when acquire fails",
      );
    },
  );

  bdd.it(
    "runs operation directly when tokenStore or auth is absent (no bracket)",
    async () => {
      let operationCalled = false;
      const operation = () => {
        operationCalled = true;
        return Promise.resolve(results.ok("direct"));
      };

      // Neither tokenStore nor auths wired
      const ctxNoStore = {
        postService: noopPostService,
      };
      const r1 = await withFreshTokens.withFreshTokens(
        ctxNoStore,
        platform,
        operation,
      );
      assert.assertEquals(operationCalled, true);
      assert.assertEquals(results.isOk(r1), true);

      // Platform not in auths map
      operationCalled = false;
      const ctxNoAuth = {
        postService: noopPostService,
        tokenStore: testing.createMockTokenStore(),
        auths: new Map<
          Platform,
          ReturnType<typeof testing.createMockAuthProvider>
        >(),
      };
      const r2 = await withFreshTokens.withFreshTokens(
        ctxNoAuth,
        platform,
        operation,
      );
      assert.assertEquals(operationCalled, true);
      assert.assertEquals(results.isOk(r2), true);
    },
  );

  bdd.it(
    "fails without running the operation when the token store cannot load",
    async () => {
      const tokenStore = {
        ...testing.createMockTokenStore(),
        load: () => Promise.reject(new Error("token file is not valid JSON")),
      };
      let operationCalled = false;

      const result = await withFreshTokens.withFreshTokens(
        {
          postService: noopPostService,
          tokenStore,
          auths: new Map([[platform, testing.createMockAuthProvider()]]),
        },
        platform,
        () => {
          operationCalled = true;
          return Promise.resolve(results.ok("done"));
        },
      );

      assert.assert(results.isFail(result));
      assert.assertEquals(
        result.error.message,
        "load saved twitter tokens: token file is not valid JSON",
      );
      assert.assertEquals(operationCalled, false);
    },
  );
});
