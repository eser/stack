// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import * as clientModule from "./client.ts";
import * as errors from "./errors.ts";
import type * as types from "./types.ts";

// =============================================================================
// Test Helpers
// =============================================================================

const noOpDelay = (_ms: number): Promise<void> => Promise.resolve();

const makeClient = (
  fetchFn: typeof fetch,
  config?: Partial<types.HttpClientConfig>,
): clientModule.HttpClient => {
  return clientModule.createHttpClient({
    fetchFn,
    _delayFn: noOpDelay,
    ...config,
  });
};

const makeStreamResponse = (
  chunks: string[],
  status = 200,
  headers: Record<string, string> = {},
): Response => {
  const enc = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(enc.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(readable, { status, headers });
};

const makeErrorResponse = (
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): Response => {
  return new Response(JSON.stringify(body ?? { error: `HTTP ${status}` }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
};

const collectStream = async (
  body: ReadableStream<Uint8Array>,
): Promise<string> => {
  const dec = new TextDecoder();
  let text = "";
  for await (const chunk of body) {
    text += dec.decode(chunk);
  }
  return text;
};

// =============================================================================
// requestStream — success path
// =============================================================================

bdd.describe("HttpClient — requestStream success", () => {
  bdd.it("returns ReadableStream without consuming the body", async () => {
    const client = makeClient(
      (_req) =>
        Promise.resolve(
          makeStreamResponse(['{"token":"hello"}', '{"token":"world"}']),
        ),
    );
    const resp = await client.requestStream(
      "POST",
      "https://example.com/stream",
    );
    assert.assertEquals(resp.status, 200);
    assert.assertInstanceOf(resp.body, ReadableStream);
    const text = await collectStream(resp.body);
    assert.assertEquals(text, '{"token":"hello"}{"token":"world"}');
  });

  bdd.it("includes retries count on first-attempt success", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeStreamResponse(["data"])),
    );
    const resp = await client.requestStream(
      "POST",
      "https://example.com/stream",
    );
    assert.assertEquals(resp.retries, 0);
  });

  bdd.it("includes rateLimit info when headers are present", async () => {
    const client = makeClient(
      (_req) =>
        Promise.resolve(
          makeStreamResponse(["data"], 200, {
            "X-RateLimit-Remaining": "42",
            "X-RateLimit-Limit": "100",
          }),
        ),
    );
    const resp = await client.requestStream(
      "POST",
      "https://example.com/stream",
    );
    assert.assertEquals(resp.rateLimit?.remaining, 42);
    assert.assertEquals(resp.rateLimit?.limit, 100);
  });
});

// =============================================================================
// requestStream — retry on 5xx
// =============================================================================

bdd.describe("HttpClient — requestStream retry on 5xx", () => {
  bdd.it("retries on 500 and succeeds on second attempt", async () => {
    let callCount = 0;
    const client = makeClient(
      (_req) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(makeErrorResponse(500));
        }
        return Promise.resolve(makeStreamResponse(["ok"]));
      },
      { retry: { maxAttempts: 2 } },
    );
    const resp = await client.requestStream(
      "POST",
      "https://example.com/stream",
    );
    assert.assertEquals(resp.status, 200);
    assert.assertEquals(resp.retries, 1);
    assert.assertEquals(callCount, 2);
  });
});

// =============================================================================
// requestStream — retry on 429 with Retry-After
// =============================================================================

bdd.describe("HttpClient — requestStream retry on 429", () => {
  bdd.it("honours Retry-After and retries", async () => {
    const delays: number[] = [];
    let callCount = 0;
    const client = clientModule.createHttpClient({
      _delayFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
      fetchFn: (_req) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            makeErrorResponse(429, { error: "rate limited" }, {
              "Retry-After": "2",
            }),
          );
        }
        return Promise.resolve(makeStreamResponse(["ok"]));
      },
      retry: { maxAttempts: 2, respectRetryAfter: true },
    });
    const resp = await client.requestStream(
      "POST",
      "https://example.com/stream",
    );
    assert.assertEquals(resp.status, 200);
    assert.assertEquals(delays, [2_000]);
  });
});

// =============================================================================
// requestStream — null body
// =============================================================================

bdd.describe("HttpClient — requestStream null body", () => {
  bdd.it("throws HttpNetworkError when response body is null", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(new Response(null, { status: 200 })),
      { retry: false },
    );
    await assert.assertRejects(
      () => client.requestStream("POST", "https://example.com/stream"),
      errors.HttpNetworkError,
    );
  });
});

// =============================================================================
// requestStream — non-2xx error
// =============================================================================

bdd.describe("HttpClient — requestStream non-2xx", () => {
  bdd.it("throws HttpResponseError for 404", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeErrorResponse(404, { error: "Not found" })),
      { retry: false },
    );
    await assert.assertRejects(
      () => client.requestStream("GET", "https://example.com/stream"),
      errors.HttpResponseError,
    );
  });

  bdd.it("throws HttpRateLimitError for 429 (no retry)", async () => {
    const client = makeClient(
      (_req) =>
        Promise.resolve(makeErrorResponse(429, { error: "Rate limited" })),
      { retry: false },
    );
    await assert.assertRejects(
      () => client.requestStream("POST", "https://example.com/stream"),
      errors.HttpRateLimitError,
    );
  });
});

// =============================================================================
// postStream — convenience method
// =============================================================================

bdd.describe("HttpClient — postStream convenience", () => {
  bdd.it("delegates to POST requestStream", async () => {
    let capturedMethod: string | undefined;
    const client = makeClient(
      (req) => {
        capturedMethod = (req as Request).method;
        return Promise.resolve(makeStreamResponse(["data"]));
      },
    );
    const resp = await client.postStream("https://example.com/stream");
    assert.assertEquals(resp.status, 200);
    assert.assertEquals(capturedMethod, "POST");
  });
});

// =============================================================================
// requestStreamResult — Result-style API
// =============================================================================

bdd.describe("HttpClient — requestStreamResult Result wrapping", () => {
  bdd.it("wraps success in Ok", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeStreamResponse(["data"])),
    );
    const r = await client.requestStreamResult(
      "POST",
      "https://example.com/stream",
    );
    assert.assertEquals(results.isOk(r), true);
    if (results.isOk(r)) {
      assert.assertInstanceOf(r.value.body, ReadableStream);
      assert.assertEquals(r.value.status, 200);
    }
  });

  bdd.it("wraps failure in Fail", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeErrorResponse(500)),
      { retry: false },
    );
    const r = await client.requestStreamResult(
      "POST",
      "https://example.com/stream",
    );
    assert.assertEquals(results.isFail(r), true);
    if (results.isFail(r)) {
      assert.assertInstanceOf(r.error, errors.HttpResponseError);
    }
  });

  bdd.it("wraps HttpNetworkError (null body) in Fail", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(new Response(null, { status: 200 })),
      { retry: false },
    );
    const r = await client.requestStreamResult(
      "POST",
      "https://example.com/stream",
    );
    assert.assertEquals(results.isFail(r), true);
    if (results.isFail(r)) {
      assert.assertInstanceOf(r.error, errors.HttpNetworkError);
    }
  });
});

// =============================================================================
// postStreamResult — convenience
// =============================================================================

bdd.describe("HttpClient — postStreamResult convenience", () => {
  bdd.it("wraps POST stream success in Ok", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeStreamResponse(["ndjson"])),
    );
    const r = await client.postStreamResult("https://example.com/stream");
    assert.assertEquals(results.isOk(r), true);
  });
});
