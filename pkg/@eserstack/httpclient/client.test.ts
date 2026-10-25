// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as clientModule from "./client.ts";
import * as errors from "./errors.ts";
import type * as types from "./types.ts";

// =============================================================================
// Test Helpers
// =============================================================================

const makeJsonResponse = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
};

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

// =============================================================================
// Basic HTTP methods
// =============================================================================

bdd.describe("HttpClient — basic requests", () => {
  bdd.it("should perform a GET request and return parsed JSON", async () => {
    const client = makeClient((_req) =>
      Promise.resolve(makeJsonResponse({ id: 1, name: "Alice" })),
    );
    const resp = await client.get<{ id: number; name: string }>(
      "https://example.com/users/1",
    );
    assert.assertEquals(resp.status, 200);
    assert.assertEquals(resp.data.id, 1);
    assert.assertEquals(resp.data.name, "Alice");
    assert.assertEquals(resp.retries, 0);
  });

  bdd.it("should perform a POST request with JSON body", async () => {
    let capturedBody: string | null = null;
    let capturedContentType: string | null = null;

    const client = makeClient(async (req) => {
      capturedBody = await (req as Request).text();
      capturedContentType = (req as Request).headers.get("Content-Type");
      return makeJsonResponse({ created: true }, 201);
    });

    const resp = await client.post<{ created: boolean }>(
      "https://example.com/users",
      { body: { name: "Bob" } },
    );
    assert.assertEquals(resp.status, 201);
    assert.assertEquals(resp.data.created, true);
    assert.assertEquals(capturedBody, JSON.stringify({ name: "Bob" }));
    assert.assertEquals(capturedContentType, "application/json");
  });

  bdd.it("should send query params", async () => {
    let capturedUrl = "";
    const client = makeClient((req) => {
      capturedUrl = (req as Request).url;
      return Promise.resolve(makeJsonResponse([]));
    });
    await client.get("https://example.com/users", {
      params: { page: "2", limit: "10" },
    });
    const url = new URL(capturedUrl);
    assert.assertEquals(url.searchParams.get("page"), "2");
    assert.assertEquals(url.searchParams.get("limit"), "10");
  });

  bdd.it("should merge baseUrl with path", async () => {
    let capturedUrl = "";
    const client = makeClient(
      (req) => {
        capturedUrl = (req as Request).url;
        return Promise.resolve(makeJsonResponse({}));
      },
      { baseUrl: "https://api.example.com/v2" },
    );
    await client.get("/users/me");
    assert.assertEquals(capturedUrl, "https://api.example.com/v2/users/me");
  });

  bdd.it(
    "should merge client-level headers with per-request headers",
    async () => {
      let capturedHeaders: Headers | null = null;
      const client = makeClient(
        (req) => {
          capturedHeaders = (req as Request).headers;
          return Promise.resolve(makeJsonResponse({}));
        },
        { headers: { Authorization: "Bearer token123" } },
      );
      await client.get("https://example.com/me", {
        headers: { "X-Request-ID": "abc" },
      });
      assert.assertEquals(
        capturedHeaders!.get("Authorization"),
        "Bearer token123",
      );
      assert.assertEquals(capturedHeaders!.get("X-Request-ID"), "abc");
    },
  );

  bdd.it("should handle 204 No Content", async () => {
    const client = makeClient((_req) =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    const resp = await client.delete<undefined>("https://example.com/users/1");
    assert.assertEquals(resp.status, 204);
    assert.assertEquals(resp.data, undefined);
  });
});

// =============================================================================
// Error handling
// =============================================================================

bdd.describe("HttpClient — error handling", () => {
  bdd.it(
    "should throw HttpResponseError for non-2xx without retry",
    async () => {
      const client = makeClient(
        (_req) =>
          Promise.resolve(makeJsonResponse({ error: "Not found" }, 404)),
        { retry: false },
      );
      await assert.assertRejects(
        () => client.get("https://example.com/missing"),
        errors.HttpResponseError,
      );
    },
  );

  bdd.it("should throw HttpRateLimitError for 429", async () => {
    const client = makeClient(
      (_req) =>
        Promise.resolve(
          makeJsonResponse({ error: "Too many requests" }, 429, {
            "Retry-After": "30",
          }),
        ),
      { retry: false },
    );
    await assert.assertRejects(
      () => client.get("https://example.com/api"),
      errors.HttpRateLimitError,
    );
  });

  bdd.it("should throw HttpNetworkError for fetch failure", async () => {
    const client = makeClient(
      (_req) => Promise.reject(new TypeError("Failed to fetch")),
      { retry: false },
    );
    await assert.assertRejects(
      () => client.get("https://example.com/api"),
      errors.HttpNetworkError,
    );
  });
});

// =============================================================================
// Retry
// =============================================================================

bdd.describe("HttpClient — retry", () => {
  bdd.it("should retry on 500 and succeed on third attempt", async () => {
    let callCount = 0;
    const client = makeClient((_req) => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve(
          makeJsonResponse({ error: "server error" }, 500),
        );
      }
      return Promise.resolve(makeJsonResponse({ ok: true }));
    });

    const resp = await client.get<{ ok: boolean }>("https://example.com/api", {
      retry: { maxAttempts: 3 },
    });
    assert.assertEquals(resp.data.ok, true);
    assert.assertEquals(resp.retries, 2);
    assert.assertEquals(callCount, 3);
  });

  bdd.it("should throw after exhausting all retry attempts", async () => {
    const client = makeClient(
      (_req) =>
        Promise.resolve(makeJsonResponse({ error: "unavailable" }, 503)),
      { retry: { maxAttempts: 3 } },
    );
    await assert.assertRejects(
      () => client.get("https://example.com/api"),
      errors.HttpResponseError,
    );
  });

  bdd.it("should not retry non-retryable status codes", async () => {
    let callCount = 0;
    const client = makeClient((_req) => {
      callCount++;
      return Promise.resolve(makeJsonResponse({ error: "forbidden" }, 403));
    });
    await assert.assertRejects(
      () =>
        client.get("https://example.com/api", {
          retry: { maxAttempts: 3 },
        }),
      errors.HttpResponseError,
    );
    assert.assertEquals(callCount, 1);
  });

  bdd.it("should respect Retry-After header on 429", async () => {
    const delays: number[] = [];
    let callCount = 0;

    const client = clientModule.createHttpClient({
      fetchFn: (_req) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            makeJsonResponse({ error: "rate limited" }, 429, {
              "Retry-After": "2",
            }),
          );
        }
        return Promise.resolve(makeJsonResponse({ ok: true }));
      },
      _delayFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });

    await client.get("https://example.com/api", {
      retry: { maxAttempts: 2, respectRetryAfter: true },
    });
    assert.assertEquals(delays.length, 1);
    assert.assertEquals(delays[0], 2_000); // 2 seconds from Retry-After
  });

  bdd.it("should disable retry when retry=false in client config", async () => {
    let callCount = 0;
    const client = makeClient(
      (_req) => {
        callCount++;
        return Promise.resolve(makeJsonResponse({ error: "unavailable" }, 503));
      },
      { retry: false },
    );
    await assert.assertRejects(
      () => client.get("https://example.com/api"),
      errors.HttpResponseError,
    );
    assert.assertEquals(callCount, 1);
  });
});

// =============================================================================
// Result-style API
// =============================================================================

bdd.describe("HttpClient — Result-style API", () => {
  bdd.it("should return Ok result on success", async () => {
    const client = makeClient((_req) =>
      Promise.resolve(makeJsonResponse({ value: 42 })),
    );
    const result = await client.getResult<{ value: number }>(
      "https://example.com/data",
    );
    assert.assertEquals(results.isOk(result), true);
    if (results.isOk(result)) {
      assert.assertEquals(result.value.data.value, 42);
    }
  });

  bdd.it("should return Fail result on error", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeJsonResponse({ error: "not found" }, 404)),
      { retry: false },
    );
    const result = await client.getResult("https://example.com/missing");
    assert.assertEquals(results.isFail(result), true);
    if (results.isFail(result)) {
      assert.assertInstanceOf(result.error, errors.HttpResponseError);
      assert.assertEquals(result.error.statusCode, 404);
    }
  });

  bdd.it("should work with do-notation run pattern", async () => {
    const client = makeClient((_req) =>
      Promise.resolve(makeJsonResponse({ id: 99 })),
    );

    const runResult = await (async () => {
      const r = await client.getResult<{ id: number }>(
        "https://example.com/resource",
      );
      if (results.isFail(r)) return r;
      return results.ok(r.value.data.id);
    })();

    assert.assertEquals(results.isOk(runResult), true);
    if (results.isOk(runResult)) {
      assert.assertEquals(runResult.value, 99);
    }
  });
});

// =============================================================================
// withDefaults
// =============================================================================

bdd.describe("HttpClient — withDefaults", () => {
  bdd.it("should create an independent client with merged config", async () => {
    let capturedHeaders: Headers | null = null;
    const base = makeClient(
      (req) => {
        capturedHeaders = (req as Request).headers;
        return Promise.resolve(makeJsonResponse({}));
      },
      { headers: { "X-App": "base" } },
    );

    const derived = base.withDefaults({ headers: { "X-Version": "2" } });
    await derived.get("https://example.com/");
    assert.assertEquals(capturedHeaders!.get("X-App"), "base");
    assert.assertEquals(capturedHeaders!.get("X-Version"), "2");
  });

  bdd.it("should not affect the original client", async () => {
    let capturedHeaders: Headers | null = null;
    const base = makeClient(
      (req) => {
        capturedHeaders = (req as Request).headers;
        return Promise.resolve(makeJsonResponse({}));
      },
      { headers: { "X-App": "base" } },
    );

    base.withDefaults({ headers: { "X-Version": "2" } });
    await base.get("https://example.com/");
    assert.assertEquals(capturedHeaders!.get("X-App"), "base");
    assert.assertEquals(capturedHeaders!.get("X-Version"), null);
  });
});

// =============================================================================
// Interceptors
// =============================================================================

bdd.describe("HttpClient — interceptors", () => {
  bdd.it("should apply request interceptors in order", async () => {
    const log: string[] = [];
    const client = makeClient((_req) => Promise.resolve(makeJsonResponse({})), {
      interceptors: {
        request: [
          {
            name: "a",
            intercept: (r) => {
              log.push("a");
              return r;
            },
          },
          {
            name: "b",
            intercept: (r) => {
              log.push("b");
              return r;
            },
          },
        ],
      },
    });
    await client.get("https://example.com/");
    assert.assertEquals(log, ["a", "b"]);
  });

  bdd.it("should apply response interceptors in order", async () => {
    const log: string[] = [];
    const client = makeClient(
      (_req) => Promise.resolve(makeJsonResponse({ x: 1 })),
      {
        interceptors: {
          response: [
            {
              name: "a",
              intercept: (r) => {
                log.push("a");
                return r;
              },
            },
            {
              name: "b",
              intercept: (r) => {
                log.push("b");
                return r;
              },
            },
          ],
        },
      },
    );
    await client.get("https://example.com/");
    assert.assertEquals(log, ["a", "b"]);
  });
});

// =============================================================================
// Rate limit info
// =============================================================================

bdd.describe("HttpClient — rate limit headers", () => {
  bdd.it("should extract rate limit info from response headers", async () => {
    const client = makeClient((_req) =>
      Promise.resolve(
        makeJsonResponse({ data: "ok" }, 200, {
          "X-RateLimit-Remaining": "42",
          "X-RateLimit-Limit": "100",
        }),
      ),
    );
    const resp = await client.get<{ data: string }>("https://example.com/api");
    assert.assertEquals(resp.rateLimit?.remaining, 42);
    assert.assertEquals(resp.rateLimit?.limit, 100);
  });

  bdd.it(
    "should not set rateLimit when no rate limit headers present",
    async () => {
      const client = makeClient((_req) =>
        Promise.resolve(makeJsonResponse({ data: "ok" })),
      );
      const resp = await client.get("https://example.com/api");
      assert.assertEquals(resp.rateLimit, undefined);
    },
  );
});

// =============================================================================
// Request bodies across retries
// =============================================================================

bdd.describe("HttpClient: request bodies across retries", () => {
  bdd.it("sends a stream body once and does not retry it", async () => {
    const bodies: string[] = [];
    const client = makeClient(async (req) => {
      bodies.push(await (req as Request).text());
      return makeJsonResponse({ error: "busy" }, 503);
    });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("chunk"));
        controller.close();
      },
    });

    const error = await assert.assertRejects(
      () => client.post("https://example.com/upload", { body }),
      errors.HttpResponseError,
    );

    assert.assertEquals(error.statusCode, 503);
    assert.assertEquals(bodies, ["chunk"]);
  });

  bdd.it("sends a string body again on each retry", async () => {
    const bodies: string[] = [];
    const client = makeClient(async (req) => {
      bodies.push(await (req as Request).text());
      return bodies.length < 2
        ? makeJsonResponse({ error: "busy" }, 503)
        : makeJsonResponse({ ok: true });
    });

    const resp = await client.post("https://example.com/jobs", {
      body: "payload",
    });

    assert.assertEquals(resp.retries, 1);
    assert.assertEquals(bodies, ["payload", "payload"]);
  });
});

// =============================================================================
// Default transport
// =============================================================================

bdd.describe("HttpClient: default transport", () => {
  // These tests swap the global fetch and restore it in a finally; the tests
  // of one module run one at a time.
  const withGlobalFetch = async (
    fn: (urls: ReadonlyArray<string>) => Promise<void>,
  ): Promise<void> => {
    const original = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (input) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(makeJsonResponse({ ok: true }));
    };
    try {
      await fn(urls);
    } finally {
      globalThis.fetch = original;
    }
  };

  bdd.it(
    "sends request() and requestStream() with fetch, like the verb methods",
    async () => {
      await withGlobalFetch(async (urls) => {
        const client = clientModule.createHttpClient({ _delayFn: noOpDelay });

        await client.request("GET", "https://example.com/a");
        const stream = await client.requestStream(
          "GET",
          "https://example.com/b",
        );
        await stream.body.cancel();
        await client.get("https://example.com/c");

        assert.assertEquals(urls, [
          "https://example.com/a",
          "https://example.com/b",
          "https://example.com/c",
        ]);
      });
    },
  );
});
