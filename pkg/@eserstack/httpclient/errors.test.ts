// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as errorsModule from "./errors.ts";

bdd.describe("HttpClientError hierarchy", () => {
  bdd.it("should create a base HttpClientError", () => {
    const err = new errorsModule.HttpClientError("test error", {
      statusCode: 500,
    });
    assert.assertInstanceOf(err, Error);
    assert.assertInstanceOf(err, errorsModule.HttpClientError);
    assert.assertEquals(err.message, "test error");
    assert.assertEquals(err.statusCode, 500);
    assert.assertEquals(err.name, "HttpClientError");
  });

  bdd.it("should default fields to null", () => {
    const err = new errorsModule.HttpClientError("test");
    assert.assertEquals(err.statusCode, null);
    assert.assertEquals(err.request, null);
    assert.assertEquals(err.response, null);
    assert.assertEquals(err.retryAfter, null);
  });

  bdd.it("should preserve cause in error chain", () => {
    const original = new Error("original");
    const err = new errorsModule.HttpRateLimitError("rate limited", {
      cause: original,
    });
    assert.assertEquals(err.cause, original);
  });
});

bdd.describe("HttpResponseError", () => {
  bdd.it("should be an instance of HttpClientError", () => {
    const err = new errorsModule.HttpResponseError("not found", {
      statusCode: 404,
    });
    assert.assertInstanceOf(err, errorsModule.HttpClientError);
    assert.assertInstanceOf(err, errorsModule.HttpResponseError);
    assert.assertEquals(err.name, "HttpResponseError");
    assert.assertEquals(err.statusCode, 404);
  });
});

bdd.describe("HttpTimeoutError", () => {
  bdd.it("should have correct name", () => {
    const err = new errorsModule.HttpTimeoutError("timed out");
    assert.assertInstanceOf(err, errorsModule.HttpClientError);
    assert.assertEquals(err.name, "HttpTimeoutError");
  });
});

bdd.describe("HttpAbortError", () => {
  bdd.it("should have correct name", () => {
    const err = new errorsModule.HttpAbortError("aborted");
    assert.assertInstanceOf(err, errorsModule.HttpClientError);
    assert.assertEquals(err.name, "HttpAbortError");
  });
});

bdd.describe("HttpRateLimitError", () => {
  bdd.it("should store retryAfter", () => {
    const err = new errorsModule.HttpRateLimitError("too many requests", {
      statusCode: 429,
      retryAfter: 60,
    });
    assert.assertInstanceOf(err, errorsModule.HttpClientError);
    assert.assertEquals(err.name, "HttpRateLimitError");
    assert.assertEquals(err.statusCode, 429);
    assert.assertEquals(err.retryAfter, 60);
  });
});

bdd.describe("HttpNetworkError", () => {
  bdd.it("should have correct name", () => {
    const err = new errorsModule.HttpNetworkError("connection refused");
    assert.assertInstanceOf(err, errorsModule.HttpClientError);
    assert.assertEquals(err.name, "HttpNetworkError");
  });
});

bdd.describe("classifyHttpStatus", () => {
  bdd.it("should classify 429 as HttpRateLimitError", () => {
    assert.assertEquals(
      errorsModule.classifyHttpStatus(429),
      errorsModule.HttpRateLimitError,
    );
  });

  bdd.it("should classify 500-599 as HttpResponseError", () => {
    assert.assertEquals(
      errorsModule.classifyHttpStatus(500),
      errorsModule.HttpResponseError,
    );
    assert.assertEquals(
      errorsModule.classifyHttpStatus(503),
      errorsModule.HttpResponseError,
    );
    assert.assertEquals(
      errorsModule.classifyHttpStatus(599),
      errorsModule.HttpResponseError,
    );
  });

  bdd.it("should classify 408 as HttpResponseError", () => {
    assert.assertEquals(
      errorsModule.classifyHttpStatus(408),
      errorsModule.HttpResponseError,
    );
  });

  bdd.it("should return null for unclassified codes", () => {
    assert.assertEquals(errorsModule.classifyHttpStatus(200), null);
    assert.assertEquals(errorsModule.classifyHttpStatus(404), null);
    assert.assertEquals(errorsModule.classifyHttpStatus(302), null);
  });
});

bdd.describe("classifyError", () => {
  bdd.it("should pass through existing HttpClientError unchanged", () => {
    const original = new errorsModule.HttpTimeoutError("already typed");
    const classified = errorsModule.classifyError(original);
    assert.assertEquals(classified, original);
  });

  bdd.it(
    "should classify TimeoutError DOMException as HttpTimeoutError",
    () => {
      const domErr = new DOMException("signal timed out", "TimeoutError");
      const classified = errorsModule.classifyError(domErr);
      assert.assertInstanceOf(classified, errorsModule.HttpTimeoutError);
      assert.assertEquals(classified.name, "HttpTimeoutError");
    },
  );

  bdd.it("should classify AbortError DOMException as HttpAbortError", () => {
    const domErr = new DOMException("The operation was aborted", "AbortError");
    const classified = errorsModule.classifyError(domErr);
    assert.assertInstanceOf(classified, errorsModule.HttpAbortError);
  });

  bdd.it("should classify network-level errors as HttpNetworkError", () => {
    const netErr = new TypeError("Failed to fetch");
    const classified = errorsModule.classifyError(netErr);
    assert.assertInstanceOf(classified, errorsModule.HttpNetworkError);
  });

  bdd.it("should classify based on response status when provided", () => {
    const err = new Error("rate limited");
    const mockResponse = new Response(null, { status: 429 });
    const classified = errorsModule.classifyError(err, mockResponse);
    assert.assertInstanceOf(classified, errorsModule.HttpRateLimitError);
    assert.assertEquals(classified.statusCode, 429);
  });

  bdd.it("should classify unknown errors as HttpClientError", () => {
    const err = new Error("some unknown error");
    const classified = errorsModule.classifyError(err);
    assert.assertInstanceOf(classified, errorsModule.HttpClientError);
    assert.assertEquals(classified.message, "some unknown error");
  });
});

bdd.describe("classifyAndWrap", () => {
  bdd.it("should wrap 429 as HttpRateLimitError", () => {
    const original = new Error("rate limited");
    const wrapped = errorsModule.classifyAndWrap(429, original);
    assert.assertInstanceOf(wrapped, errorsModule.HttpRateLimitError);
    assert.assertEquals(wrapped.statusCode, 429);
    assert.assertEquals(wrapped.cause, original);
  });

  bdd.it("should wrap 500 as HttpResponseError", () => {
    const original = new Error("server error");
    const wrapped = errorsModule.classifyAndWrap(500, original);
    assert.assertInstanceOf(wrapped, errorsModule.HttpResponseError);
    assert.assertEquals(wrapped.statusCode, 500);
  });

  bdd.it("should wrap unknown status as HttpResponseError", () => {
    const original = new Error("not found");
    const wrapped = errorsModule.classifyAndWrap(404, original);
    assert.assertInstanceOf(wrapped, errorsModule.HttpResponseError);
    assert.assertEquals(wrapped.statusCode, 404);
  });

  bdd.it("should forward extra options", () => {
    const original = new Error("forbidden");
    const mockResponse = new Response(null, { status: 403 });
    const wrapped = errorsModule.classifyAndWrap(403, original, {
      response: mockResponse,
    });
    assert.assertEquals(wrapped.response, mockResponse);
  });
});
