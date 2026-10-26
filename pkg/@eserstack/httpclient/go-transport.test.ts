// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// HttpClient with transport "native", against a fake Go client. The request
// pipeline (interceptors, retries, status handling) is the one the fetch
// tests in client.test.ts cover; these tests check that it runs the same way
// when the Go client does the exchange.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as clientModule from "./client.ts";
import * as errors from "./errors.ts";
import * as goClientModule from "./go-client.ts";
import type * as types from "./types.ts";

// =============================================================================
// Test Helpers
// =============================================================================

type Answer = goClientModule.GoHttpResponse | goClientModule.GoHttpError;

type GoCall = {
  readonly request: goClientModule.GoHttpRequest;
  readonly stream: boolean;
};

const ok = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = { "Content-Type": "application/json" },
): goClientModule.GoHttpResponse => ({
  status,
  statusText: "",
  headers,
  body: typeof body === "string" ? body : JSON.stringify(body),
  retries: 0,
});

const httpError = (
  status: number,
  headers: Record<string, string> = {},
): goClientModule.GoHttpError =>
  new goClientModule.GoHttpError({
    error: `HTTP ${status}`,
    status,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ error: `server said ${status}` }),
  });

/** A Go client that answers with `answers` in order, then with the last one. */
const createFakeGoClient = (answers: ReadonlyArray<Answer>) => {
  const calls: GoCall[] = [];
  const created: goClientModule.GoHttpClientOptions[] = [];
  let closeCalls = 0;

  const next = (request: goClientModule.GoHttpRequest, stream: boolean) => {
    calls.push({ request, stream });
    return answers[Math.min(calls.length - 1, answers.length - 1)]!;
  };

  const client: goClientModule.GoHttpClient = {
    request: (request) => {
      const answer = next(request, false);
      return answer instanceof goClientModule.GoHttpError
        ? Promise.reject(answer)
        : Promise.resolve(answer);
    },
    requestStream: (request) => {
      const answer = next(request, true);
      if (answer instanceof goClientModule.GoHttpError) {
        return Promise.reject(answer);
      }
      return Promise.resolve({
        status: answer.status,
        statusText: answer.statusText,
        headers: answer.headers,
        body: new Response(answer.body).body!,
      });
    },
    close: () => {
      closeCalls++;
    },
  };

  const createGoClient = (options: goClientModule.GoHttpClientOptions) => {
    created.push(options);
    return Promise.resolve(client);
  };

  return { calls, created, closeCalls: () => closeCalls, createGoClient };
};

const noOpDelay = (_ms: number): Promise<void> => Promise.resolve();

const makeNativeClient = (
  answers: ReadonlyArray<Answer>,
  config: Partial<types.HttpClientConfig> = {},
) => {
  const fake = createFakeGoClient(answers);
  const client = clientModule.createHttpClient({
    transport: "native",
    _createGoClient: fake.createGoClient,
    _delayFn: noOpDelay,
    ...config,
  });
  return { client, fake };
};

// =============================================================================
// Requests
// =============================================================================

bdd.describe("HttpClient transport native: requests", () => {
  bdd.it(
    "sends the built URL, headers and JSON body to the Go client",
    async () => {
      const { client, fake } = makeNativeClient([ok({ id: 1 }, 201)], {
        baseUrl: "https://api.example.com",
      });

      const resp = await client.post<{ id: number }>("/users", {
        body: { name: "Ada" },
        params: { notify: "true" },
        headers: { "X-Request-Id": "r-1" },
      });

      assert.assertEquals(resp.status, 201);
      assert.assertEquals(resp.data, { id: 1 });
      assert.assertEquals(resp.retries, 0);
      const sent = fake.calls[0]!.request;
      assert.assertEquals(sent.method, "POST");
      assert.assertEquals(
        sent.url,
        "https://api.example.com/users?notify=true",
      );
      assert.assertEquals(sent.headers?.["x-request-id"], "r-1");
      assert.assertEquals(sent.headers?.["content-type"], "application/json");
      assert.assertEquals(sent.body, JSON.stringify({ name: "Ada" }));
      assert.assertEquals(fake.calls[0]!.stream, false);
    },
  );

  bdd.it("takes the same path for request() and the verb methods", async () => {
    const { client, fake } = makeNativeClient([ok({})]);

    await client.request("GET", "https://api.example.com/a");
    await client.get("https://api.example.com/b");
    await client.getResult("https://api.example.com/c");

    assert.assertEquals(
      fake.calls.map((call) => call.request.url),
      [
        "https://api.example.com/a",
        "https://api.example.com/b",
        "https://api.example.com/c",
      ],
    );
  });

  bdd.it("leaves data undefined for a 204", async () => {
    const { client } = makeNativeClient([ok("", 204, {})]);

    const resp = await client.delete("https://api.example.com/users/1");

    assert.assertEquals(resp.status, 204);
    assert.assertEquals(resp.data, undefined);
  });

  bdd.it("refuses a binary body before calling the Go client", async () => {
    const { client, fake } = makeNativeClient([ok({})]);

    await assert.assertRejects(
      () =>
        client.post("https://api.example.com/upload", {
          body: new Uint8Array([1, 2, 3]),
        }),
      errors.HttpClientError,
      'transport "native" sends text bodies only',
    );
    assert.assertEquals(fake.calls.length, 0);
  });

  bdd.it("stops an aborted request before the Go call", async () => {
    const { client, fake } = makeNativeClient([ok({})]);

    await assert.assertRejects(
      () =>
        client.get("https://api.example.com/users", {
          signal: AbortSignal.abort(),
        }),
      errors.HttpAbortError,
    );
    assert.assertEquals(fake.calls.length, 0);
  });
});

// =============================================================================
// Interceptors
// =============================================================================

bdd.describe("HttpClient transport native: interceptors", () => {
  bdd.it("runs request interceptors before the Go call", async () => {
    const { client, fake } = makeNativeClient([ok({})], {
      interceptors: {
        request: [
          {
            name: "auth",
            intercept: (request) => {
              const headers = new Headers(request.headers);
              headers.set("Authorization", "Bearer your_access_token");
              return new Request(request, { headers });
            },
          },
        ],
      },
    });

    await client.request("GET", "https://api.example.com/me");

    assert.assertEquals(
      fake.calls[0]!.request.headers?.["authorization"],
      "Bearer your_access_token",
    );
  });

  bdd.it("runs response interceptors on the parsed response", async () => {
    const { client } = makeNativeClient([ok({ name: "ada" })], {
      interceptors: {
        response: [
          {
            name: "upper",
            intercept: <T>(response: types.HttpResponse<T>) => ({
              ...response,
              data: { name: "ADA" } as T,
            }),
          },
        ],
      },
    });

    const resp = await client.request<{ name: string }>(
      "GET",
      "https://api.example.com/me",
    );

    assert.assertEquals(resp.data.name, "ADA");
  });
});

// =============================================================================
// Retries and errors
// =============================================================================

bdd.describe("HttpClient transport native: retries and errors", () => {
  bdd.it(
    "retries a 503 by the retry policy and counts the retries",
    async () => {
      const { client, fake } = makeNativeClient([
        httpError(503),
        httpError(503),
        ok({ done: true }),
      ]);

      const resp = await client.request<{ done: boolean }>(
        "GET",
        "https://api.example.com/jobs/1",
      );

      assert.assertEquals(resp.data.done, true);
      assert.assertEquals(resp.retries, 2);
      assert.assertEquals(fake.calls.length, 3);
    },
  );

  bdd.it("reports an error status with the parsed body", async () => {
    const { client } = makeNativeClient([httpError(404)]);

    const error = await assert.assertRejects(
      () => client.request("GET", "https://api.example.com/users/9"),
      errors.HttpResponseError,
      "server said 404",
    );

    assert.assertEquals(error.statusCode, 404);
    assert.assertEquals(error.body, { error: "server said 404" });
  });

  bdd.it("reports a 429 with its Retry-After", async () => {
    const { client } = makeNativeClient(
      [httpError(429, { "Retry-After": "7" })],
      {
        retry: false,
      },
    );

    const error = await assert.assertRejects(
      () => client.request("GET", "https://api.example.com/users"),
      errors.HttpRateLimitError,
    );

    assert.assertEquals(error.retryAfter, 7);
  });

  bdd.it(
    "retries a transport failure, then reports HttpNetworkError",
    async () => {
      const refused = new goClientModule.GoHttpError({
        error: "request failed: dial tcp: connection refused",
      });
      const { client, fake } = makeNativeClient([refused], {
        retry: { maxAttempts: 2 },
      });

      await assert.assertRejects(
        () => client.request("GET", "https://api.example.com/users"),
        errors.HttpNetworkError,
        "connection refused",
      );
      assert.assertEquals(fake.calls.length, 2);
    },
  );
});

// =============================================================================
// Streaming
// =============================================================================

bdd.describe("HttpClient transport native: requestStream", () => {
  bdd.it(
    "hands the body over unread, through the Go streaming call",
    async () => {
      const { client, fake } = makeNativeClient([
        ok('{"n":1}\n{"n":2}\n', 200, {
          "Content-Type": "application/x-ndjson",
        }),
      ]);

      const resp = await client.postStream("https://api.example.com/stream", {
        body: { prompt: "hi" },
      });

      assert.assertEquals(fake.calls[0]!.stream, true);
      assert.assertEquals(resp.retries, 0);
      assert.assertEquals(
        await new Response(resp.body).text(),
        '{"n":1}\n{"n":2}\n',
      );
    },
  );

  bdd.it("retries a stream that answers 503 before it starts", async () => {
    const { client, fake } = makeNativeClient([httpError(503), ok("data")]);

    const resp = await client.requestStream(
      "GET",
      "https://api.example.com/events",
    );

    assert.assertEquals(resp.retries, 1);
    assert.assertEquals(fake.calls.length, 2);
    assert.assertEquals(await new Response(resp.body).text(), "data");
  });
});

// =============================================================================
// The Go client
// =============================================================================

bdd.describe("HttpClient transport native: the Go client", () => {
  bdd.it(
    "is created once, with the client's timeout and no Go retries",
    async () => {
      const { client, fake } = makeNativeClient([ok({})], { timeout: 5_000 });

      await client.get("https://api.example.com/a");
      await client.get("https://api.example.com/b");

      assert.assertEquals(fake.created, [{ timeoutMs: 5_000 }]);
    },
  );

  bdd.it("gets the default timeout when the client sets none", async () => {
    const { client, fake } = makeNativeClient([ok({})]);

    await client.get("https://api.example.com/a");

    assert.assertEquals(fake.created, [{ timeoutMs: 30_000 }]);
  });

  bdd.it(
    "is released by close() and created again on the next request",
    async () => {
      const { client, fake } = makeNativeClient([ok({})]);

      await client.get("https://api.example.com/a");
      client.close();
      await Promise.resolve();
      assert.assertEquals(fake.closeCalls(), 1);

      await client.get("https://api.example.com/b");
      assert.assertEquals(fake.created.length, 2);
    },
  );

  bdd.it("names the fix when it cannot be created", async () => {
    const cause = new Error("native library unavailable");
    const client = clientModule.createHttpClient({
      transport: "native",
      _createGoClient: () => Promise.reject(cause),
    });

    const error = await assert.assertRejects(
      () => client.get("https://api.example.com/a"),
      errors.HttpClientError,
      'remove transport: "native" to send requests with fetch',
    );
    assert.assertStrictEquals(error.cause, cause);
  });

  bdd.it("cannot be combined with fetchFn", () => {
    assert.assertThrows(
      () =>
        clientModule.createHttpClient({
          transport: "native",
          fetchFn: () => Promise.resolve(new Response()),
        }),
      TypeError,
      'fetchFn and transport "native" exclude each other',
    );
  });
});
