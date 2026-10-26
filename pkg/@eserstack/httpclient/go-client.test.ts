// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "node:test";
import * as net from "node:net";
import * as fake from "@eserstack/ajan/ffi/fake";
import * as goClientModule from "./go-client.ts";
import * as ffiClient from "./ffi-client.ts";

// Importing the package loads nothing, so this test module opens the bridge
// before registering tests: the `skip` flags below need to know whether it
// loaded, and the load stays outside every test body.
// oxlint-disable-next-line node/no-top-level-await
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
  bdd.it(
    "passes timeoutMs to the Go client, which ends a request with no answer",
    { skip: withoutFfi },
    async () => {
      // The server accepts the connection and never answers, so only the Go
      // client's timeout can end the request. The sockets are destroyed in the
      // finally, since close() waits for open connections.
      const sockets = new Set<net.Socket>();
      const server = net.createServer((socket) => {
        sockets.add(socket);
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          resolve();
        });
      });
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error(
          `the test server listens on ${String(address)}, not a TCP port`,
        );
      }
      const client = await goClientModule.createGoHttpClient({
        timeoutMs: 200,
      });
      const started = Date.now();
      try {
        const error = await assert.assertRejects(
          () =>
            client.request({
              method: "GET",
              url: `http://127.0.0.1:${address.port}/`,
            }),
          goClientModule.GoHttpError,
        );

        assert.assertEquals(error.status, 0);
        assert.assertLess(Date.now() - started, 5_000);
      } finally {
        client.close();
        for (const socket of sockets) {
          socket.destroy();
        }
        await new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        });
      }
    },
  );
});

bdd.describe("createGoHttpClientFor", () => {
  bdd.it("releases its client handle with the bare handle", () => {
    const closed: unknown[] = [];
    const lib = fake.createFakeLibrary({
      calls: {
        httpCreate: () => ({ handle: "http-7" }),
        httpClose: (handle) => {
          closed.push(handle);
          return {};
        },
      },
    });

    const client = goClientModule.createGoHttpClientFor(lib, {});
    client.close();

    // Go's httpClose takes the handle itself; a JSON-wrapped handle matched
    // no client, so the client was never released.
    assert.assertEquals(closed, ["http-7"]);
  });

  bdd.it("maps an error answer to a GoHttpError", async () => {
    const lib = fake.createFakeLibrary({
      calls: {
        httpCreate: () => ({ handle: "http-8" }),
        httpRequest: () => ({
          error: "HTTP 404 Not Found",
          status: 404,
          statusText: "Not Found",
          body: "nope",
        }),
      },
    });

    const client = goClientModule.createGoHttpClientFor(lib, {});
    const error = await assert.assertRejects(
      () => client.request({ method: "GET", url: "/missing" }),
      goClientModule.GoHttpError,
    );
    assert.assertEquals(error.status, 404);
    assert.assertEquals(error.body, "nope");
  });

  bdd.it("streams a body and closes the stream on cancel", async () => {
    const closed: string[] = [];
    const chunks = [btoa("one "), btoa("two")];
    const lib = fake.createFakeLibrary({
      calls: { httpCreate: () => ({ handle: "http-9" }) },
      streams: {
        httpRequestStream: {
          open: () => ({ handle: "httpstream-1", status: 200, headers: {} }),
          read: () => {
            const chunk = chunks.shift();
            return chunk === undefined
              ? { done: true }
              : { chunk, done: false };
          },
          close: (handle) => {
            closed.push(handle);
            return {};
          },
        },
      },
    });

    const client = goClientModule.createGoHttpClientFor(lib, {});
    const streamed = await client.requestStream({ method: "GET", url: "/s" });
    assert.assertEquals(await new Response(streamed.body).text(), "one two");
    // A stream read to its end releases its Go handle.
    assert.assertEquals(closed, ["httpstream-1"]);

    const again = await client.requestStream({ method: "GET", url: "/s" });
    await again.body.cancel();
    assert.assertEquals(closed, ["httpstream-1", "httpstream-1"]);
  });
});
