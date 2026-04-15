// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertInstanceOf } from "@std/assert";
import * as errorsModule from "./errors.ts";

describe("HttpClientError hierarchy", () => {
  it("should create a base HttpClientError", () => {
    const err = new errorsModule.HttpClientError("test error", {
      statusCode: 500,
    });
    assertInstanceOf(err, Error);
    assertInstanceOf(err, errorsModule.HttpClientError);
    assertEquals(err.message, "test error");
    assertEquals(err.statusCode, 500);
    assertEquals(err.name, "HttpClientError");
  });

  it("should default fields to null", () => {
    const err = new errorsModule.HttpClientError("test");
    assertEquals(err.statusCode, null);
    assertEquals(err.request, null);
    assertEquals(err.response, null);
    assertEquals(err.retryAfter, null);
  });

  it("should preserve cause in error chain", () => {
    const original = new Error("original");
    const err = new errorsModule.HttpRateLimitError("rate limited", {
      cause: original,
    });
    assertEquals(err.cause, original);
  });
});

describe("HttpResponseError", () => {
  it("should be an instance of HttpClientError", () => {
    const err = new errorsModule.HttpResponseError("not found", {
      statusCode: 404,
    });
    assertInstanceOf(err, errorsModule.HttpClientError);
    assertInstanceOf(err, errorsModule.HttpResponseError);
    assertEquals(err.name, "HttpResponseError");
    assertEquals(err.statusCode, 404);
  });
});

describe("HttpTimeoutError", () => {
  it("should have correct name", () => {
    const err = new errorsModule.HttpTimeoutError("timed out");
    assertInstanceOf(err, errorsModule.HttpClientError);
    assertEquals(err.name, "HttpTimeoutError");
  });
});

describe("HttpAbortError", () => {
  it("should have correct name", () => {
    const err = new errorsModule.HttpAbortError("aborted");
    assertInstanceOf(err, errorsModule.HttpClientError);
    assertEquals(err.name, "HttpAbortError");
  });
});

describe("HttpRateLimitError", () => {
  it("should store retryAfter", () => {
    const err = new errorsModule.HttpRateLimitError("too many requests", {
      statusCode: 429,
      retryAfter: 60,
    });
    assertInstanceOf(err, errorsModule.HttpClientError);
    assertEquals(err.name, "HttpRateLimitError");
    assertEquals(err.statusCode, 429);
    assertEquals(err.retryAfter, 60);
  });
});

describe("HttpNetworkError", () => {
  it("should have correct name", () => {
    const err = new errorsModule.HttpNetworkError("connection refused");
    assertInstanceOf(err, errorsModule.HttpClientError);
    assertEquals(err.name, "HttpNetworkError");
  });
});

describe("classifyHttpStatus", () => {
  it("should classify 429 as HttpRateLimitError", () => {
    assertEquals(
      errorsModule.classifyHttpStatus(429),
      errorsModule.HttpRateLimitError,
    );
  });

  it("should classify 500-599 as HttpResponseError", () => {
    assertEquals(
      errorsModule.classifyHttpStatus(500),
      errorsModule.HttpResponseError,
    );
    assertEquals(
      errorsModule.classifyHttpStatus(503),
      errorsModule.HttpResponseError,
    );
    assertEquals(
      errorsModule.classifyHttpStatus(599),
      errorsModule.HttpResponseError,
    );
  });

  it("should classify 408 as HttpResponseError", () => {
    assertEquals(
      errorsModule.classifyHttpStatus(408),
      errorsModule.HttpResponseError,
    );
  });

  it("should return null for unclassified codes", () => {
    assertEquals(errorsModule.classifyHttpStatus(200), null);
    assertEquals(errorsModule.classifyHttpStatus(404), null);
    assertEquals(errorsModule.classifyHttpStatus(302), null);
  });
});

describe("classifyError", () => {
  it("should pass through existing HttpClientError unchanged", () => {
    const original = new errorsModule.HttpTimeoutError("already typed");
    const classified = errorsModule.classifyError(original);
    assertEquals(classified, original);
  });

  it("should classify TimeoutError DOMException as HttpTimeoutError", () => {
    const domErr = new DOMException("signal timed out", "TimeoutError");
    const classified = errorsModule.classifyError(domErr);
    assertInstanceOf(classified, errorsModule.HttpTimeoutError);
    assertEquals(classified.name, "HttpTimeoutError");
  });

  it("should classify AbortError DOMException as HttpAbortError", () => {
    const domErr = new DOMException("The operation was aborted", "AbortError");
    const classified = errorsModule.classifyError(domErr);
    assertInstanceOf(classified, errorsModule.HttpAbortError);
  });

  it("should classify network-level errors as HttpNetworkError", () => {
    const netErr = new TypeError("Failed to fetch");
    const classified = errorsModule.classifyError(netErr);
    assertInstanceOf(classified, errorsModule.HttpNetworkError);
  });

  it("should classify based on response status when provided", () => {
    const err = new Error("rate limited");
    const mockResponse = new Response(null, { status: 429 });
    const classified = errorsModule.classifyError(err, mockResponse);
    assertInstanceOf(classified, errorsModule.HttpRateLimitError);
    assertEquals(classified.statusCode, 429);
  });

  it("should classify unknown errors as HttpClientError", () => {
    const err = new Error("some unknown error");
    const classified = errorsModule.classifyError(err);
    assertInstanceOf(classified, errorsModule.HttpClientError);
    assertEquals(classified.message, "some unknown error");
  });
});

describe("classifyAndWrap", () => {
  it("should wrap 429 as HttpRateLimitError", () => {
    const original = new Error("rate limited");
    const wrapped = errorsModule.classifyAndWrap(429, original);
    assertInstanceOf(wrapped, errorsModule.HttpRateLimitError);
    assertEquals(wrapped.statusCode, 429);
    assertEquals(wrapped.cause, original);
  });

  it("should wrap 500 as HttpResponseError", () => {
    const original = new Error("server error");
    const wrapped = errorsModule.classifyAndWrap(500, original);
    assertInstanceOf(wrapped, errorsModule.HttpResponseError);
    assertEquals(wrapped.statusCode, 500);
  });

  it("should wrap unknown status as HttpResponseError", () => {
    const original = new Error("not found");
    const wrapped = errorsModule.classifyAndWrap(404, original);
    assertInstanceOf(wrapped, errorsModule.HttpResponseError);
    assertEquals(wrapped.statusCode, 404);
  });

  it("should forward extra options", () => {
    const original = new Error("forbidden");
    const mockResponse = new Response(null, { status: 403 });
    const wrapped = errorsModule.classifyAndWrap(403, original, {
      response: mockResponse,
    });
    assertEquals(wrapped.response, mockResponse);
  });
});
