// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "@std/testing/bdd";
import * as goClientModule from "./go-client.ts";
import * as ffiClient from "./ffi-client.ts";

// Importing the package loads nothing, so this test module opens the bridge
// before registering tests: the `ignore` flags below need to know whether it
// loaded, and the load stays outside every test body.
// deno-lint-ignore no-top-level-await
await ffiClient.ensureLib();
const withoutFfi = ffiClient.getLib() === null;

bdd.describe("GoHttpError", () => {
  bdd.it("constructs with all structured fields", () => {
    const err = new goClientModule.GoHttpError({
      error: "HTTP 429 Too Many Requests",
      status: 429,
      statusText: "Too Many Requests",
      headers: { "Retry-After": "30", "Content-Type": "application/json" },
      body: '{"error":"rate limited"}',
      retries: 2,
    });

    assert.assertInstanceOf(err, goClientModule.GoHttpError);
    assert.assertInstanceOf(err, Error);
    assert.assertEquals(err.message, "HTTP 429 Too Many Requests");
    assert.assertEquals(err.name, "GoHttpError");
    assert.assertEquals(err.status, 429);
    assert.assertEquals(err.statusText, "Too Many Requests");
    assert.assertEquals(err.headers["Retry-After"], "30");
    assert.assertEquals(err.body, '{"error":"rate limited"}');
    assert.assertEquals(err.retries, 2);
  });

  bdd.it("defaults missing fields to safe values", () => {
    const err = new goClientModule.GoHttpError({ error: "request failed" });

    assert.assertEquals(err.status, 0);
    assert.assertEquals(err.statusText, "");
    assert.assertEquals(err.headers, {});
    assert.assertEquals(err.body, "");
    assert.assertEquals(err.retries, 0);
  });

  bdd.it("is identifiable via instanceof in catch blocks", () => {
    let caught: unknown;
    try {
      throw new goClientModule.GoHttpError({
        error: "HTTP 404 Not Found",
        status: 404,
      });
    } catch (e) {
      caught = e;
    }

    assert.assertInstanceOf(caught, goClientModule.GoHttpError);
    assert.assertEquals((caught as goClientModule.GoHttpError).status, 404);
  });
});

bdd.describe("createGoHttpClient options", () => {
  for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    bdd.it(
      `refuses timeoutMs ${timeoutMs}, which would leave calls unbounded`,
      async () => {
        await assert.assertRejects(
          () => goClientModule.createGoHttpClient({ timeoutMs }),
          RangeError,
          "is not a positive number of milliseconds",
        );
      },
    );
  }

  // Needs the native library: the Go client itself enforces the limit.
  bdd.it({
    name: "passes timeoutMs to the Go client, which ends a request with no answer",
    ignore: withoutFfi,
    fn: async () => {
      // The kernel accepts the connection into the backlog and nothing ever
      // answers, so only the Go client's timeout can end the request.
      const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
      const client = await goClientModule.createGoHttpClient({
        timeoutMs: 200,
      });
      const started = Date.now();
      try {
        const error = await assert.assertRejects(
          () =>
            client.request({
              method: "GET",
              url: `http://127.0.0.1:${listener.addr.port}/`,
            }),
          goClientModule.GoHttpError,
        );

        assert.assertEquals(error.status, 0);
        assert.assertLess(Date.now() - started, 5_000);
      } finally {
        client.close();
        listener.close();
      }
    },
  });
});
