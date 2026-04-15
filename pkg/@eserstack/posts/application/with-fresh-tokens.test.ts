// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import type { Platform } from "../domain/values/platform.ts";
import { AuthRequiredError } from "./auth-required-error.ts";
import type { InboundPostService } from "./post-service.ts";
import {
  createMockAuthProvider,
  createMockTokenStore,
  createTestTokens,
} from "./testing.ts";
import { withFreshTokens } from "./with-fresh-tokens.ts";

const platform: Platform = "twitter";
// Minimal stand-in — withFreshTokens never touches postService directly.
const noopPostService = {} as InboundPostService;

bdd.describe("withFreshTokens", () => {
  bdd.it(
    "happy path: installs valid tokens and saves them after the operation",
    async () => {
      const tokenStore = createMockTokenStore();
      const auth = createMockAuthProvider();
      const tokens = createTestTokens();
      tokenStore.store.set(platform, tokens);

      const ctx = {
        postService: noopPostService,
        tokenStore,
        auths: new Map([[platform, auth]]),
      };

      const result = await withFreshTokens(
        ctx,
        platform,
        () => Promise.resolve(results.ok("done")),
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
      const tokenStore = createMockTokenStore();
      const refreshedTokens = createTestTokens({
        accessToken: "refreshed-token",
      });
      const auth = createMockAuthProvider({
        refreshToken: () => Promise.resolve(refreshedTokens),
      });
      const expiredTokens = createTestTokens({
        expiresAt: new Date(Date.now() - 1_000), // already expired
      });
      tokenStore.store.set(platform, expiredTokens);

      const ctx = {
        postService: noopPostService,
        tokenStore,
        auths: new Map([[platform, auth]]),
      };

      let installedTokens;
      const result = await withFreshTokens(ctx, platform, () => {
        installedTokens = auth.calls
          .filter((c) => c.method === "setTokens")
          .at(-1)?.args[0];
        return Promise.resolve(results.ok("done"));
      });

      assert.assertEquals(results.isOk(result), true);
      assert.assertEquals(installedTokens, refreshedTokens);
      const savedCall = tokenStore.calls.find((c) => c.method === "save");
      assert.assertExists(savedCall);
      assert.assertEquals(savedCall.args[1], refreshedTokens);
    },
  );

  bdd.it(
    "saves tokens even when the operation fails",
    async () => {
      const tokenStore = createMockTokenStore();
      const auth = createMockAuthProvider();
      tokenStore.store.set(platform, createTestTokens());

      const ctx = {
        postService: noopPostService,
        tokenStore,
        auths: new Map([[platform, auth]]),
      };

      const err = new Error("API error");
      const result = await withFreshTokens(
        ctx,
        platform,
        () => Promise.resolve(results.fail(err)),
      );

      assert.assertEquals(results.isFail(result), true);
      assert.assertEquals(
        tokenStore.calls.some((c) => c.method === "save"),
        true,
        "release must save tokens even after a failing operation",
      );
    },
  );

  bdd.it(
    "returns AuthRequiredError when no tokens are stored",
    async () => {
      const tokenStore = createMockTokenStore(); // store is empty
      const auth = createMockAuthProvider();

      const ctx = {
        postService: noopPostService,
        tokenStore,
        auths: new Map([[platform, auth]]),
      };

      const result = await withFreshTokens(
        ctx,
        platform,
        () => Promise.resolve(results.ok("never")),
      );

      assert.assertEquals(results.isFail(result), true);
      assert.assertInstanceOf(
        results.isFail(result) ? result.error : null,
        AuthRequiredError,
      );
    },
  );

  bdd.it(
    "returns AuthRequiredError when token is expired and has no refresh token",
    async () => {
      const tokenStore = createMockTokenStore();
      const auth = createMockAuthProvider();
      tokenStore.store.set(
        platform,
        createTestTokens({
          expiresAt: new Date(Date.now() - 1_000),
          refreshToken: undefined,
        }),
      );

      const ctx = {
        postService: noopPostService,
        tokenStore,
        auths: new Map([[platform, auth]]),
      };

      const result = await withFreshTokens(
        ctx,
        platform,
        () => Promise.resolve(results.ok("never")),
      );

      assert.assertEquals(results.isFail(result), true);
      assert.assertInstanceOf(
        results.isFail(result) ? result.error : null,
        AuthRequiredError,
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
      const r1 = await withFreshTokens(ctxNoStore, platform, operation);
      assert.assertEquals(operationCalled, true);
      assert.assertEquals(results.isOk(r1), true);

      // Platform not in auths map
      operationCalled = false;
      const ctxNoAuth = {
        postService: noopPostService,
        tokenStore: createMockTokenStore(),
        auths: new Map<Platform, ReturnType<typeof createMockAuthProvider>>(),
      };
      const r2 = await withFreshTokens(ctxNoAuth, platform, operation);
      assert.assertEquals(operationCalled, true);
      assert.assertEquals(results.isOk(r2), true);
    },
  );
});
