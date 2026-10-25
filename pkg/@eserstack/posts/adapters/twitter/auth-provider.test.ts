// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as util from "node:util";
import * as assert from "@eserstack/test-kit/assert";
import * as authProvider from "./auth-provider.ts";
import * as clientMod from "./client.ts";

const BASE_URL = "https://api.x.test/2";
const REDIRECT_URI = "http://127.0.0.1:8080/callback";

/** A TwitterClient whose fetch records each request and answers with a token. */
const createRecordingClient = (requests: Request[]): clientMod.TwitterClient =>
  new clientMod.TwitterClient({
    baseUrl: BASE_URL,
    fetchFn: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        Response.json({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          token_type: "bearer",
          expires_in: 7200,
        }),
      );
    },
  });

bdd.describe("TwitterAuthProvider token requests", () => {
  const tokenCalls = [
    {
      name: "exchangeCode",
      call: (provider: authProvider.TwitterAuthProvider) =>
        provider.exchangeCode({ code: "the-code", codeVerifier: "verifier" }),
    },
    {
      name: "refreshToken",
      call: (provider: authProvider.TwitterAuthProvider) =>
        provider.refreshToken("old-refresh-token"),
    },
  ];

  for (const { name, call } of tokenCalls) {
    bdd.it(`${name} sends Basic auth when a client secret is set`, async () => {
      const requests: Request[] = [];
      const provider = new authProvider.TwitterAuthProvider(
        {
          clientId: "client-id",
          clientSecret: "client-secret",
          redirectUri: REDIRECT_URI,
        },
        createRecordingClient(requests),
      );

      const tokens = await call(provider);

      assert.assertEquals(tokens.accessToken, "new-access-token");
      assert.assertEquals(requests.length, 1);
      assert.assertEquals(
        requests[0]?.headers.get("authorization"),
        `Basic ${btoa("client-id:client-secret")}`,
      );
    });

    bdd.it(
      `${name} sends no Authorization header without a secret`,
      async () => {
        const requests: Request[] = [];
        const provider = new authProvider.TwitterAuthProvider(
          { clientId: "client-id", redirectUri: REDIRECT_URI },
          createRecordingClient(requests),
        );

        await call(provider);

        assert.assertEquals(requests.length, 1);
        assert.assertEquals(requests[0]?.headers.get("authorization"), null);
        const body = new URLSearchParams(await requests[0]?.text());
        assert.assertEquals(body.get("client_id"), "client-id");
      },
    );
  }

  bdd.it("keeps the client secret out of JSON and inspect output", () => {
    const provider = new authProvider.TwitterAuthProvider(
      {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: REDIRECT_URI,
      },
      createRecordingClient([]),
    );

    assert.assertEquals(
      JSON.stringify(provider).includes("client-secret"),
      false,
    );
    assert.assertEquals(
      util.inspect(provider).includes("client-secret"),
      false,
    );
    assert.assertEquals(
      util.inspect(provider).includes(btoa("client-id:client-secret")),
      false,
    );
  });
});
