// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * HTTP works on the WASM fallback (TASK-277): under Node with FFI turned off,
 * the Go-backed httpclient reaches a local server through the reactor's host
 * fetch, follows a same-scheme redirect and not a cross-scheme one, streams a
 * body, and stops a request in flight through its AbortSignal while the
 * instance keeps serving calls.
 *
 * @module
 */

import * as childProcess from "node:child_process";
import * as http from "node:http";
import type * as net from "node:net";
import * as stream from "node:stream";
import * as nodeTest from "node:test";
import * as util from "node:util";
import * as assert from "@eserstack/test-kit/assert";
import * as resolve from "./resolve.ts";

const hasWasm = ((): boolean => {
  try {
    resolve.resolveWasmPath(import.meta.dirname);
    return true;
  } catch {
    return false;
  }
})();

const nodeMajor = Number(process.versions.node.split(".")[0]);

let flakyCalls = 0;

const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  switch (url.pathname) {
    case "/hello":
      return new Response("hello wasm", { headers: { "x-test": "yes" } });
    case "/echo":
      return new Response(`echo:${await request.text()}`);
    case "/redirect-same":
      return Response.redirect(new URL("/hello", url), 302);
    case "/redirect-other-scheme":
      return new Response(null, {
        status: 302,
        headers: { location: `https://${url.host}/hello` },
      });
    case "/stream":
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const part of ["one ", "two ", "three"]) {
              controller.enqueue(new TextEncoder().encode(part));
            }
            controller.close();
          },
        }),
      );
    case "/slow":
      // Until the client goes away, which the abort makes it do.
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3_000);
        request.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve(undefined);
        });
      });
      return new Response("too late");
    case "/flaky":
      flakyCalls += 1;
      return flakyCalls < 3
        ? new Response("busy", { status: 503 })
        : new Response("third time");
    default:
      return new Response("nope", { status: 404 });
  }
};

/**
 * Serves `fetchHandler` over node:http on a free local port. The request's
 * signal aborts when the client goes away before the answer is complete.
 */
const serve = async (
  fetchHandler: (request: Request) => Promise<Response>,
): Promise<http.Server> => {
  const server = http.createServer(async (incoming, outgoing) => {
    const controller = new AbortController();
    outgoing.on("close", () => {
      if (!outgoing.writableFinished) {
        controller.abort();
      }
    });

    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      for (const item of [value ?? []].flat()) {
        headers.append(name, item);
      }
    }

    const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD";
    const request = new Request(
      `http://${incoming.headers.host}${incoming.url ?? "/"}`,
      {
        method: incoming.method ?? "GET",
        headers,
        signal: controller.signal,
        ...(hasBody
          ? {
              body: stream.Readable.toWeb(incoming) as ReadableStream,
              duplex: "half",
            }
          : {}),
      },
    );

    const response = await fetchHandler(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body !== null) {
      for await (const chunk of response.body) {
        outgoing.write(chunk);
      }
    }
    outgoing.end();
  });

  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));

  return server;
};

nodeTest.test(
  "httpclient requests go through the reactor's host fetch",
  { skip: !hasWasm || nodeMajor < 26 },
  async () => {
    const server = await serve(handler);
    const { port } = server.address() as net.AddressInfo;

    try {
      // Asynchronous on purpose: the server above runs on this thread.
      const { stdout } = await util.promisify(childProcess.execFile)(
        process.execPath,
        [
          "--no-experimental-ffi",
          "--disable-warning=ExperimentalWarning",
          `${import.meta.dirname}/node-reactor-http.fixture.ts`,
          `http://127.0.0.1:${port}`,
        ],
        { encoding: "utf8", timeout: 60_000 },
      );

      const seen = JSON.parse(stdout.trim());
      assert.assertEquals(seen.reactor, true);
      assert.assertEquals(seen.hello, {
        status: 200,
        statusText: "OK",
        header: "yes",
        body: "hello wasm",
      });
      assert.assertEquals(seen.posted, "echo:ping");
      assert.assertEquals(seen.notFound, {
        message: "HTTP 404 Not Found",
        status: 404,
      });
      assert.assertEquals(seen.redirected, "hello wasm");
      assert.assertEquals(seen.otherScheme.status, 302);
      assert.assertStringIncludes(seen.otherScheme.location, "https://");
      assert.assertEquals(seen.streamed, "one two three");
      assert.assertEquals(seen.formatsDuringWait, true);
      assert.assertStringIncludes(seen.aborted, "request aborted");
      assert.assertEquals(
        seen.abortMs < 2_000,
        true,
        `abort took ${seen.abortMs} ms`,
      );
      assert.assertEquals(seen.afterAbort, "hello wasm");
      // Two 503s, then the answer: the retry rules of the native bridge.
      assert.assertEquals(seen.retried, {
        status: 200,
        body: "third time",
        retries: 2,
      });
    } finally {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  },
);
