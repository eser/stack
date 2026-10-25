// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Run by node-reactor-http.test.ts under `node --no-experimental-ffi`, with the
 * test server's URL as its argument: makes requests through the Go-backed
 * httpclient on the WASM fallback and prints one JSON line with what it saw.
 * It runs under plain Node from the source tree and writes with console.log.
 *
 * @module
 */

import * as goClient from "../../httpclient/go-client.ts";
import * as ffi from "../ffi/mod.ts";

// Plain Node, so the arguments and the exit code come from its process
// object; the cross-runtime layer is not importable from here.
const nodeProcess = (
  globalThis as unknown as {
    process: { argv: string[]; exitCode?: number };
  }
).process;

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const main = async (): Promise<void> => {
  const base = nodeProcess.argv[2]!;
  const lib = await ffi.loadEserAjan();
  const symbols = lib.symbols as unknown as Record<
    string,
    (...args: string[]) => string
  >;

  // A name outside the profile throws UnsupportedInWasmError only on the
  // reactor, so this tells which build answered.
  let reactor = false;
  try {
    symbols["EserAjanShellExec"]!("{}");
  } catch (error) {
    reactor = (error as { code?: string }).code === "UNSUPPORTED_IN_WASM";
  }

  const client = await goClient.createGoHttpClient({
    baseUrl: base,
    timeoutMs: 5_000,
  });

  const hello = await client.request({ method: "GET", url: "/hello" });
  const posted = await client.request({
    method: "POST",
    url: "/echo",
    body: "ping",
    headers: { "content-type": "text/plain" },
  });

  let notFound: unknown;
  try {
    await client.request({ method: "GET", url: "/missing" });
  } catch (error) {
    notFound = {
      message: errorText(error),
      status: (error as { status?: number }).status,
    };
  }

  const redirected = await client.request({
    method: "GET",
    url: "/redirect-same",
  });
  const otherScheme = await client.request({
    method: "GET",
    url: "/redirect-other-scheme",
  });

  const stream = await client.requestStream({ method: "GET", url: "/stream" });
  const streamed = await new Response(stream.body).text();

  // While the slow request waits on the host, synchronous calls go on.
  const controller = new AbortController();
  const slow = client.request({
    method: "GET",
    url: "/slow",
    signal: controller.signal,
  });
  const formatsDuringWait = JSON.parse(symbols["EserAjanFormatList"]!()) as {
    error?: string;
  };
  setTimeout(() => controller.abort(), 100);
  let aborted = "";
  const startedAt = Date.now();
  try {
    await slow;
  } catch (error) {
    aborted = errorText(error);
  }
  const abortMs = Date.now() - startedAt;

  const afterAbort = await client.request({ method: "GET", url: "/hello" });
  client.close();

  const asyncSymbols = lib.symbols as unknown as Record<
    string,
    (...args: string[]) => string | Promise<string>
  >;
  const retrying = JSON.parse(
    await asyncSymbols["EserAjanHttpCreate"]!(
      JSON.stringify({
        baseUrl: base,
        retryEnabled: true,
        maxAttempts: 3,
        initialIntervalMs: 10,
      }),
    ),
  ) as { handle: string };
  const retried = JSON.parse(
    await asyncSymbols["EserAjanHttpRequest"]!(
      JSON.stringify({ handle: retrying.handle, method: "GET", url: "/flaky" }),
    ),
  ) as { status: number; body: string; retries: number };

  // deno-lint-ignore no-console
  console.log(
    JSON.stringify({
      reactor,
      hello: {
        status: hello.status,
        statusText: hello.statusText,
        header: hello.headers["X-Test"],
        body: hello.body,
      },
      posted: posted.body,
      notFound,
      redirected: redirected.body,
      otherScheme: {
        status: otherScheme.status,
        location: otherScheme.headers["Location"],
      },
      streamed,
      formatsDuringWait: formatsDuringWait.error === undefined,
      aborted,
      abortMs,
      afterAbort: afterAbort.body,
      retried: {
        status: retried.status,
        body: retried.body,
        retries: retried.retries,
      },
    }),
  );
};

main().catch((error) => {
  // deno-lint-ignore no-console
  console.error(error);
  nodeProcess.exitCode = 1;
});
