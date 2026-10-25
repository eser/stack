// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The HTTP server of profile-parity.test.ts, on its own thread: a native
 * bridge call blocks the test's thread until it returns, so a server there
 * could never answer it. Posts its port once it listens.
 *
 * @module
 */

const server = Deno.serve(
  {
    hostname: "127.0.0.1",
    port: 0,
    onListen: ({ port }) => self.postMessage({ port }),
  },
  async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/echo") {
      return new Response(`echo:${await request.text()}`, {
        headers: { "x-parity": "yes" },
      });
    }
    if (path === "/stream") {
      return new Response("streamed body");
    }
    return new Response("nope", { status: 404 });
  },
);

self.onmessage = async () => {
  await server.shutdown();
  self.close();
};
