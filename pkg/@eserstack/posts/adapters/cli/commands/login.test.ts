// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import type { OAuthTokens } from "../../../domain/entities/user.ts";
import type { Platform } from "../../../domain/values/platform.ts";
import type { AuthProvider } from "../../../application/auth-provider.ts";
import * as testing from "../../../application/testing.ts";
import * as login from "./login.ts";

const browserTokens = testing.createTestTokens({ accessToken: "browser" });
const passwordTokens = testing.createTestTokens({ accessToken: "password" });

/** Twitter/X logs in through the browser, Bluesky with an app password. */
const createWorld = (
  overrides: {
    readonly bluesky?: login.BlueskyCredentials;
    readonly browserLogin?: login.LoginDeps["browserLogin"];
  } = {},
) => {
  const twitter = testing.createMockAuthProvider({ requiresBrowser: true });
  const bluesky = testing.createMockAuthProvider({
    loginWithCredentials: () => Promise.resolve(passwordTokens),
  });
  const tokenStore = testing.createMockTokenStore();
  const browserLogins: Platform[] = [];
  const outcomes: login.LoginOutcome[] = [];

  const deps: login.LoginDeps = {
    auths: new Map<Platform, AuthProvider>([
      ["twitter", twitter],
      ["bluesky", bluesky],
    ]),
    tokenStore,
    bluesky: overrides.bluesky ?? {
      identifier: "me.bsky.social",
      appPassword: "app-password",
    },
    browserLogin:
      overrides.browserLogin ??
      ((platform) => {
        browserLogins.push(platform);
        return Promise.resolve(results.ok<OAuthTokens>(browserTokens));
      }),
  };

  const run = (args: login.LoginArgs) =>
    login.login(args, deps, (outcome) => {
      outcomes.push(outcome);
      return Promise.resolve();
    });

  return { twitter, bluesky, tokenStore, browserLogins, outcomes, run };
};

const credentialLogins = (auth: testing.MockAuthProvider) =>
  auth.calls
    .filter((call) => call.method === "loginWithCredentials")
    .map((call) => call.args[0]);

bdd.describe("parseLoginArgs", () => {
  for (const flag of ["--password=hunter2", "--password"]) {
    bdd.it(`rejects ${flag} without echoing a value`, () => {
      const parsed = login.parseLoginArgs(["--platform=bluesky", flag]);

      assert.assert(results.isFail(parsed));
      assert.assertStringIncludes(parsed.error, "BLUESKY_APP_PASSWORD");
      assert.assertEquals(parsed.error.includes("hunter2"), false);
    });
  }

  bdd.it("reads --platform and --handle", () => {
    const parsed = login.parseLoginArgs([
      "--platform=bluesky",
      "--handle=me.bsky.social",
    ]);

    assert.assert(results.isOk(parsed));
    assert.assertEquals(parsed.value, {
      platform: "bluesky",
      handle: "me.bsky.social",
    });
  });

  bdd.it("rejects a mistyped flag without echoing its value", () => {
    const parsed = login.parseLoginArgs(["--pasword=hunter2"]);

    assert.assert(results.isFail(parsed));
    assert.assertStringIncludes(parsed.error, "unknown flag --pasword");
    assert.assertEquals(parsed.error.includes("hunter2"), false);
  });

  bdd.it("rejects a positional argument without echoing it", () => {
    const parsed = login.parseLoginArgs(["hunter2"]);

    assert.assert(results.isFail(parsed));
    assert.assertStringIncludes(parsed.error, "positional arguments");
    assert.assertEquals(parsed.error.includes("hunter2"), false);
  });
});

bdd.describe("login", () => {
  bdd.it(
    "saves the tokens of a completed Twitter/X browser login",
    async () => {
      const world = createWorld();

      const result = await world.run({
        platform: "twitter",
        handle: undefined,
      });

      assert.assert(results.isOk(result));
      assert.assertEquals(world.browserLogins, ["twitter"]);
      assert.assertEquals(world.tokenStore.store.get("twitter"), browserTokens);
      assert.assertEquals(
        world.outcomes.map((outcome) => outcome.ok),
        [true],
      );
    },
  );

  bdd.it("saves nothing when the browser login fails", async () => {
    const world = createWorld({
      browserLogin: () =>
        Promise.resolve(
          results.fail(new Error("the redirect URL does not match")),
        ),
    });

    const result = await world.run({ platform: "twitter", handle: undefined });

    assert.assert(results.isFail(result));
    assert.assertEquals(world.tokenStore.store.size, 0);
    assert.assertEquals(
      world.outcomes[0]?.message,
      "Login to twitter failed: the redirect URL does not match",
    );
  });

  bdd.it("logs in to Bluesky with the configured account", async () => {
    const world = createWorld();

    const result = await world.run({ platform: "bluesky", handle: undefined });

    assert.assert(results.isOk(result));
    assert.assertEquals(credentialLogins(world.bluesky), [
      { identifier: "me.bsky.social", password: "app-password" },
    ]);
    assert.assertEquals(world.tokenStore.store.get("bluesky"), passwordTokens);
    assert.assertStringIncludes(
      world.outcomes[0]?.message ?? "",
      "as me.bsky.social",
    );
  });

  bdd.it("prefers --handle over BLUESKY_IDENTIFIER", async () => {
    const world = createWorld();

    await world.run({ platform: "bluesky", handle: "other.bsky.social" });

    assert.assertEquals(credentialLogins(world.bluesky), [
      { identifier: "other.bsky.social", password: "app-password" },
    ]);
  });

  bdd.it("names the missing variables instead of logging in", async () => {
    const world = createWorld({
      bluesky: { identifier: undefined, appPassword: undefined },
    });

    const result = await world.run({ platform: "bluesky", handle: undefined });

    assert.assert(results.isFail(result));
    assert.assertEquals(credentialLogins(world.bluesky), []);
    assert.assertStringIncludes(
      world.outcomes[0]?.message ?? "",
      "BLUESKY_IDENTIFIER (or --handle) and BLUESKY_APP_PASSWORD",
    );
  });

  bdd.it(
    "logs in to every configured platform without --platform",
    async () => {
      const world = createWorld();

      const result = await world.run({
        platform: undefined,
        handle: undefined,
      });

      assert.assert(results.isOk(result));
      assert.assertEquals(
        world.outcomes.map((outcome) => outcome.platform),
        ["twitter", "bluesky"],
      );
      assert.assertEquals(
        [...world.tokenStore.store.keys()],
        ["twitter", "bluesky"],
      );
    },
  );

  bdd.it("stops at the first platform that fails", async () => {
    const world = createWorld({
      browserLogin: () => Promise.resolve(results.fail(new Error("timed out"))),
    });

    const result = await world.run({ platform: undefined, handle: undefined });

    assert.assert(results.isFail(result));
    assert.assertEquals(
      world.outcomes.map((outcome) => outcome.platform),
      ["twitter"],
    );
    assert.assertEquals(credentialLogins(world.bluesky), []);
  });

  bdd.it("fails for a platform that is not configured", async () => {
    const world = createWorld();

    const result = await world.run({ platform: "mastodon", handle: undefined });

    assert.assert(results.isFail(result));
    assert.assertEquals(
      world.outcomes[0]?.message,
      'Platform "mastodon" is not configured; the configured platforms are twitter, bluesky',
    );
  });
});
