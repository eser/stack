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

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as resolve from "./resolve.ts";

const hasWasm = ((): boolean => {
  try {
    resolve.resolveWasmPath(import.meta.dirname);
    return true;
  } catch {
    return false;
  }
})();

const readNodeMajor = async (): Promise<number | null> => {
  try {
    const { success, stdout } = await runtime.exec.spawn("node", ["--version"]);
    const version = new TextDecoder().decode(stdout).trim();
    return success ? Number(version.slice(1).split(".")[0]) : null;
  } catch {
    return null;
  }
};

// oxlint-disable-next-line node/no-top-level-await
const nodeMajor = (await readNodeMajor()) ?? 0;

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

Deno.test({
  name: "httpclient requests go through the reactor's host fetch",
  ignore: !hasWasm || nodeMajor < 26,
  fn: async () => {
    const server = Deno.serve(
      { hostname: "127.0.0.1", port: 0, onListen: () => {} },
      handler,
    );

    try {
      const result = await runtime.exec.spawn("node", [
        "--no-experimental-ffi",
        "--disable-warning=ExperimentalWarning",
        `${import.meta.dirname}/node-reactor-http.fixture.ts`,
        `http://127.0.0.1:${server.addr.port}`,
      ]);

      const stdout = new TextDecoder().decode(result.stdout);
      const stderr = new TextDecoder().decode(result.stderr);
      assert.assertEquals(result.success, true, stderr);

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
      await server.shutdown();
    }
  },
});
