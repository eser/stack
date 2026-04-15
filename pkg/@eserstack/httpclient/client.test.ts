// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
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

describe("HttpClient — basic requests", () => {
  it("should perform a GET request and return parsed JSON", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeJsonResponse({ id: 1, name: "Alice" })),
    );
    const resp = await client.get<{ id: number; name: string }>(
      "https://example.com/users/1",
    );
    assertEquals(resp.status, 200);
    assertEquals(resp.data.id, 1);
    assertEquals(resp.data.name, "Alice");
    assertEquals(resp.retries, 0);
  });

  it("should perform a POST request with JSON body", async () => {
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
    assertEquals(resp.status, 201);
    assertEquals(resp.data.created, true);
    assertEquals(capturedBody, JSON.stringify({ name: "Bob" }));
    assertEquals(capturedContentType, "application/json");
  });

  it("should send query params", async () => {
    let capturedUrl = "";
    const client = makeClient((req) => {
      capturedUrl = (req as Request).url;
      return Promise.resolve(makeJsonResponse([]));
    });
    await client.get("https://example.com/users", {
      params: { page: "2", limit: "10" },
    });
    const url = new URL(capturedUrl);
    assertEquals(url.searchParams.get("page"), "2");
    assertEquals(url.searchParams.get("limit"), "10");
  });

  it("should merge baseUrl with path", async () => {
    let capturedUrl = "";
    const client = makeClient(
      (req) => {
        capturedUrl = (req as Request).url;
        return Promise.resolve(makeJsonResponse({}));
      },
      { baseUrl: "https://api.example.com/v2" },
    );
    await client.get("/users/me");
    assertEquals(capturedUrl, "https://api.example.com/v2/users/me");
  });

  it("should merge client-level headers with per-request headers", async () => {
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
    assertEquals(capturedHeaders!.get("Authorization"), "Bearer token123");
    assertEquals(capturedHeaders!.get("X-Request-ID"), "abc");
  });

  it("should handle 204 No Content", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(new Response(null, { status: 204 })),
    );
    const resp = await client.delete<undefined>(
      "https://example.com/users/1",
    );
    assertEquals(resp.status, 204);
    assertEquals(resp.data, undefined);
  });
});

// =============================================================================
// Error handling
// =============================================================================

describe("HttpClient — error handling", () => {
  it("should throw HttpResponseError for non-2xx without retry", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeJsonResponse({ error: "Not found" }, 404)),
      { retry: false },
    );
    await assertRejects(
      () => client.get("https://example.com/missing"),
      errors.HttpResponseError,
    );
  });

  it("should throw HttpRateLimitError for 429", async () => {
    const client = makeClient(
      (_req) =>
        Promise.resolve(
          makeJsonResponse({ error: "Too many requests" }, 429, {
            "Retry-After": "30",
          }),
        ),
      { retry: false },
    );
    await assertRejects(
      () => client.get("https://example.com/api"),
      errors.HttpRateLimitError,
    );
  });

  it("should throw HttpNetworkError for fetch failure", async () => {
    const client = makeClient(
      (_req) => Promise.reject(new TypeError("Failed to fetch")),
      { retry: false },
    );
    await assertRejects(
      () => client.get("https://example.com/api"),
      errors.HttpNetworkError,
    );
  });
});

// =============================================================================
// Retry
// =============================================================================

describe("HttpClient — retry", () => {
  it("should retry on 500 and succeed on third attempt", async () => {
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
    assertEquals(resp.data.ok, true);
    assertEquals(resp.retries, 2);
    assertEquals(callCount, 3);
  });

  it("should throw after exhausting all retry attempts", async () => {
    const client = makeClient(
      (_req) =>
        Promise.resolve(makeJsonResponse({ error: "unavailable" }, 503)),
      { retry: { maxAttempts: 3 } },
    );
    await assertRejects(
      () => client.get("https://example.com/api"),
      errors.HttpResponseError,
    );
  });

  it("should not retry non-retryable status codes", async () => {
    let callCount = 0;
    const client = makeClient((_req) => {
      callCount++;
      return Promise.resolve(makeJsonResponse({ error: "forbidden" }, 403));
    });
    await assertRejects(
      () =>
        client.get("https://example.com/api", {
          retry: { maxAttempts: 3 },
        }),
      errors.HttpResponseError,
    );
    assertEquals(callCount, 1);
  });

  it("should respect Retry-After header on 429", async () => {
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
    assertEquals(delays.length, 1);
    assertEquals(delays[0], 2_000); // 2 seconds from Retry-After
  });

  it("should disable retry when retry=false in client config", async () => {
    let callCount = 0;
    const client = makeClient(
      (_req) => {
        callCount++;
        return Promise.resolve(makeJsonResponse({ error: "unavailable" }, 503));
      },
      { retry: false },
    );
    await assertRejects(
      () => client.get("https://example.com/api"),
      errors.HttpResponseError,
    );
    assertEquals(callCount, 1);
  });
});

// =============================================================================
// Result-style API
// =============================================================================

describe("HttpClient — Result-style API", () => {
  it("should return Ok result on success", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeJsonResponse({ value: 42 })),
    );
    const result = await client.getResult<{ value: number }>(
      "https://example.com/data",
    );
    assertEquals(results.isOk(result), true);
    if (results.isOk(result)) {
      assertEquals(result.value.data.value, 42);
    }
  });

  it("should return Fail result on error", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeJsonResponse({ error: "not found" }, 404)),
      { retry: false },
    );
    const result = await client.getResult("https://example.com/missing");
    assertEquals(results.isFail(result), true);
    if (results.isFail(result)) {
      assertInstanceOf(result.error, errors.HttpResponseError);
      assertEquals(result.error.statusCode, 404);
    }
  });

  it("should work with do-notation run pattern", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeJsonResponse({ id: 99 })),
    );

    const runResult = await (async () => {
      const r = await client.getResult<{ id: number }>(
        "https://example.com/resource",
      );
      if (results.isFail(r)) return r;
      return results.ok(r.value.data.id);
    })();

    assertEquals(results.isOk(runResult), true);
    if (results.isOk(runResult)) {
      assertEquals(runResult.value, 99);
    }
  });
});

// =============================================================================
// withDefaults
// =============================================================================

describe("HttpClient — withDefaults", () => {
  it("should create an independent client with merged config", async () => {
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
    assertEquals(capturedHeaders!.get("X-App"), "base");
    assertEquals(capturedHeaders!.get("X-Version"), "2");
  });

  it("should not affect the original client", async () => {
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
    assertEquals(capturedHeaders!.get("X-App"), "base");
    assertEquals(capturedHeaders!.get("X-Version"), null);
  });
});

// =============================================================================
// Interceptors
// =============================================================================

describe("HttpClient — interceptors", () => {
  it("should apply request interceptors in order", async () => {
    const log: string[] = [];
    const client = makeClient(
      (_req) => Promise.resolve(makeJsonResponse({})),
      {
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
      },
    );
    await client.get("https://example.com/");
    assertEquals(log, ["a", "b"]);
  });

  it("should apply response interceptors in order", async () => {
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
    assertEquals(log, ["a", "b"]);
  });
});

// =============================================================================
// Rate limit info
// =============================================================================

describe("HttpClient — rate limit headers", () => {
  it("should extract rate limit info from response headers", async () => {
    const client = makeClient(
      (_req) =>
        Promise.resolve(
          makeJsonResponse({ data: "ok" }, 200, {
            "X-RateLimit-Remaining": "42",
            "X-RateLimit-Limit": "100",
          }),
        ),
    );
    const resp = await client.get<{ data: string }>("https://example.com/api");
    assertEquals(resp.rateLimit?.remaining, 42);
    assertEquals(resp.rateLimit?.limit, 100);
  });

  it("should not set rateLimit when no rate limit headers present", async () => {
    const client = makeClient(
      (_req) => Promise.resolve(makeJsonResponse({ data: "ok" })),
    );
    const resp = await client.get("https://example.com/api");
    assertEquals(resp.rateLimit, undefined);
  });
});
