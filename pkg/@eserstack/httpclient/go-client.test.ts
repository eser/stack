// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Wave 4 Phase E — GoHttpError class and typed reconstruction.

import { assertEquals, assertInstanceOf } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import * as goClientModule from "./go-client.ts";
import * as errors from "./errors.ts";

describe("GoHttpError", () => {
  it("constructs with all structured fields", () => {
    const err = new goClientModule.GoHttpError({
      error: "HTTP 429 Too Many Requests",
      status: 429,
      statusText: "Too Many Requests",
      headers: { "Retry-After": "30", "Content-Type": "application/json" },
      body: '{"error":"rate limited"}',
      retries: 2,
    });

    assertInstanceOf(err, goClientModule.GoHttpError);
    assertInstanceOf(err, Error);
    assertEquals(err.message, "HTTP 429 Too Many Requests");
    assertEquals(err.name, "GoHttpError");
    assertEquals(err.status, 429);
    assertEquals(err.statusText, "Too Many Requests");
    assertEquals(err.headers["Retry-After"], "30");
    assertEquals(err.body, '{"error":"rate limited"}');
    assertEquals(err.retries, 2);
  });

  it("defaults missing fields to safe values", () => {
    const err = new goClientModule.GoHttpError({ error: "request failed" });

    assertEquals(err.status, 0);
    assertEquals(err.statusText, "");
    assertEquals(err.headers, {});
    assertEquals(err.body, "");
    assertEquals(err.retries, 0);
  });

  it("is identifiable via instanceof in catch blocks", () => {
    let caught: unknown;
    try {
      throw new goClientModule.GoHttpError({
        error: "HTTP 404 Not Found",
        status: 404,
      });
    } catch (e) {
      caught = e;
    }

    assertInstanceOf(caught, goClientModule.GoHttpError);
    assertEquals((caught as goClientModule.GoHttpError).status, 404);
  });
});

describe("typed error reconstruction from GoHttpError", () => {
  const classify = (
    goErr: goClientModule.GoHttpError,
  ): errors.HttpClientError => {
    if (goErr.status > 0) {
      let body: unknown = goErr.body;
      try {
        body = JSON.parse(goErr.body);
      } catch {
        /* keep string */
      }
      const retryAfterHeader =
        goErr.headers["Retry-After"] ?? goErr.headers["retry-after"] ?? null;
      const retryAfterMs = retryAfterHeader !== null
        ? (() => {
          const s = Number(retryAfterHeader);
          return !Number.isNaN(s) ? Math.round(s * 1000) : null;
        })()
        : null;
      const opts: errors.HttpClientErrorOptions = {
        statusCode: goErr.status,
        body,
        ...(retryAfterMs !== null && { retryAfter: retryAfterMs / 1000 }),
      };
      if (goErr.status === 429) return new errors.HttpRateLimitError(`HTTP ${goErr.status}`, opts);
      return new errors.HttpResponseError(`HTTP ${goErr.status}`, opts);
    }
    return new errors.HttpNetworkError(goErr.message, { cause: goErr });
  };

  it("maps 429 to HttpRateLimitError with retryAfter", () => {
    const goErr = new goClientModule.GoHttpError({
      error: "HTTP 429 Too Many Requests",
      status: 429,
      headers: { "Retry-After": "60" },
      body: "",
      retries: 0,
    });

    const typed = classify(goErr);
    assertInstanceOf(typed, errors.HttpRateLimitError);
    assertEquals(typed.statusCode, 429);
    assertEquals(typed.retryAfter, 60);
  });

  it("maps 404 to HttpResponseError", () => {
    const goErr = new goClientModule.GoHttpError({
      error: "HTTP 404 Not Found",
      status: 404,
      body: "not found",
      retries: 0,
    });

    const typed = classify(goErr);
    assertInstanceOf(typed, errors.HttpResponseError);
    assertEquals(typed.statusCode, 404);
    assertEquals(typed.body, "not found");
  });

  it("maps transport error (status=0) to HttpNetworkError", () => {
    const goErr = new goClientModule.GoHttpError({
      error: "request failed: ECONNREFUSED",
    });

    const typed = classify(goErr);
    assertInstanceOf(typed, errors.HttpNetworkError);
    assertEquals(typed.statusCode, null);
  });

  it("parses JSON body in error payload", () => {
    const goErr = new goClientModule.GoHttpError({
      error: "HTTP 422 Unprocessable Entity",
      status: 422,
      body: '{"message":"validation failed"}',
      retries: 0,
    });

    const typed = classify(goErr);
    assertInstanceOf(typed, errors.HttpResponseError);
    assertEquals((typed.body as Record<string, string>)["message"], "validation failed");
  });
});
