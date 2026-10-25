// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as tui from "@eserstack/shell/tui";
import * as testing from "../../application/testing.ts";
import * as browserLogin from "./browser-login.ts";

const REDIRECT_URI = "http://127.0.0.1:8080/callback";

/** An auth provider whose authorization request carries state "issued". */
const createBrowserAuth = () =>
  testing.createMockAuthProvider({
    requiresBrowser: true,
    getAuthorizationUrl: () =>
      Promise.resolve({
        url: "https://x.example/authorize?state=issued",
        codeVerifier: "the-verifier",
        state: "issued",
      }),
    exchangeCode: () =>
      Promise.resolve(testing.createTestTokens({ accessToken: "exchanged" })),
  });

const exchangedWith = (auth: ReturnType<typeof createBrowserAuth>) =>
  auth.calls
    .filter((call) => call.method === "exchangeCode")
    .map((call) => call.args[0]);

bdd.describe("runBrowserLogin", () => {
  bdd.it("exchanges the code from the loopback redirect", async () => {
    const { ctx, getOutput } = tui.createTestContext();
    const auth = createBrowserAuth();
    const waited: string[] = [];

    const result = await browserLogin.runBrowserLogin("Twitter/X", auth, {
      ctx,
      redirectUri: REDIRECT_URI,
      waitForCallback: (expected) => {
        waited.push(
          `${expected.hostname}:${expected.port}${expected.pathname}`,
        );
        return Promise.resolve({ code: "the-code", state: expected.state });
      },
      enterRedirectUrl: () => Promise.reject(new Error("not expected")),
    });

    assert.assert(results.isOk(result));
    assert.assertEquals(result.value.accessToken, "exchanged");
    assert.assertEquals(waited, ["127.0.0.1:8080/callback"]);
    assert.assertEquals(exchangedWith(auth), [
      { code: "the-code", codeVerifier: "the-verifier" },
    ]);
    await ctx.output.flush();
    assert.assertStringIncludes(
      getOutput(),
      "https://x.example/authorize?state=issued",
    );
  });

  bdd.it("accepts a pasted redirect URL with the issued state", async () => {
    const { ctx } = tui.createTestContext();
    const auth = createBrowserAuth();

    const result = await browserLogin.runBrowserLogin("Twitter/X", auth, {
      ctx,
      redirectUri: REDIRECT_URI,
      waitForCallback: () => Promise.reject(new Error("port 8080 is in use")),
      enterRedirectUrl: () =>
        Promise.resolve({ code: "pasted-code", state: "issued" }),
    });

    assert.assert(results.isOk(result));
    assert.assertEquals(exchangedWith(auth), [
      { code: "pasted-code", codeVerifier: "the-verifier" },
    ]);
  });

  bdd.it("rejects a pasted redirect URL from another attempt", async () => {
    const { ctx } = tui.createTestContext();
    const auth = createBrowserAuth();

    const result = await browserLogin.runBrowserLogin("Twitter/X", auth, {
      ctx,
      redirectUri: REDIRECT_URI,
      waitForCallback: () => Promise.reject(new Error("timed out")),
      enterRedirectUrl: () =>
        Promise.resolve({ code: "foreign-code", state: "someone-else" }),
    });

    assert.assert(results.isFail(result));
    assert.assertStringIncludes(
      result.error.message,
      "does not match this login attempt",
    );
    assert.assertEquals(exchangedWith(auth), []);
  });

  bdd.it("fails without exchanging when the prompt is cancelled", async () => {
    const { ctx } = tui.createTestContext();
    const auth = createBrowserAuth();

    const result = await browserLogin.runBrowserLogin("Twitter/X", auth, {
      ctx,
      redirectUri: REDIRECT_URI,
      waitForCallback: () => Promise.reject(new Error("timed out")),
      enterRedirectUrl: () => Promise.reject(new Error("Login cancelled.")),
    });

    assert.assert(results.isFail(result));
    assert.assertEquals(
      result.error.message,
      "read the redirect URL: Login cancelled.",
    );
    assert.assertEquals(exchangedWith(auth), []);
  });

  bdd.it("reports a failed code exchange", async () => {
    const { ctx } = tui.createTestContext();
    const auth = testing.createMockAuthProvider({
      requiresBrowser: true,
      exchangeCode: () => Promise.reject(new Error("invalid_grant")),
    });

    const result = await browserLogin.runBrowserLogin("Twitter/X", auth, {
      ctx,
      redirectUri: REDIRECT_URI,
      waitForCallback: (expected) =>
        Promise.resolve({ code: "the-code", state: expected.state }),
    });

    assert.assert(results.isFail(result));
    assert.assertEquals(
      result.error.message,
      "exchange the Twitter/X authorization code: invalid_grant",
    );
  });
});
