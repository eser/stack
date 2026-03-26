// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertInstanceOf } from "@std/assert";
import * as errorsModule from "./errors.ts";

describe("AiError hierarchy", () => {
  it("should create a base AiError", () => {
    const err = new errorsModule.AiError("test error", {
      provider: "openai",
      statusCode: 500,
    });
    assertInstanceOf(err, Error);
    assertInstanceOf(err, errorsModule.AiError);
    assertEquals(err.message, "test error");
    assertEquals(err.provider, "openai");
    assertEquals(err.statusCode, 500);
  });

  it("should default provider and statusCode to null", () => {
    const err = new errorsModule.AiError("test");
    assertEquals(err.provider, null);
    assertEquals(err.statusCode, null);
  });

  it("should create RateLimitedError", () => {
    const err = new errorsModule.RateLimitedError("too many requests", {
      provider: "anthropic",
    });
    assertInstanceOf(err, errorsModule.AiError);
    assertInstanceOf(err, errorsModule.RateLimitedError);
    assertEquals(err.statusCode, 429);
  });

  it("should create AuthFailedError", () => {
    const err = new errorsModule.AuthFailedError("bad key");
    assertInstanceOf(err, errorsModule.AuthFailedError);
    assertEquals(err.statusCode, 401);
  });

  it("should create InsufficientCreditsError", () => {
    const err = new errorsModule.InsufficientCreditsError("no credits");
    assertEquals(err.statusCode, 402);
  });

  it("should create BadRequestError", () => {
    const err = new errorsModule.BadRequestError("invalid params");
    assertEquals(err.statusCode, 400);
  });

  it("should create ServiceUnavailableError", () => {
    const err = new errorsModule.ServiceUnavailableError("server down");
    assertEquals(err.statusCode, 503);
  });

  it("should preserve cause in error chain", () => {
    const original = new Error("original error");
    const err = new errorsModule.RateLimitedError("rate limited", {
      cause: original,
    });
    assertEquals(err.cause, original);
  });
});

describe("Registry errors", () => {
  it("should create ModelNotFoundError", () => {
    const err = new errorsModule.ModelNotFoundError("my-model");
    assertInstanceOf(err, errorsModule.AiError);
    assertEquals(err.message, 'Model "my-model" not found in registry');
  });

  it("should create ModelAlreadyExistsError", () => {
    const err = new errorsModule.ModelAlreadyExistsError("default");
    assertEquals(err.message, 'Model "default" already exists in registry');
  });

  it("should create UnsupportedProviderError", () => {
    const err = new errorsModule.UnsupportedProviderError("unknown-provider");
    assertEquals(
      err.message,
      'No factory registered for provider "unknown-provider"',
    );
  });
});

describe("classifyStatusCode", () => {
  it("should classify 429 as RateLimitedError", () => {
    assertEquals(
      errorsModule.classifyStatusCode(429),
      errorsModule.RateLimitedError,
    );
  });

  it("should classify 401 as AuthFailedError", () => {
    assertEquals(
      errorsModule.classifyStatusCode(401),
      errorsModule.AuthFailedError,
    );
  });

  it("should classify 402 as InsufficientCreditsError", () => {
    assertEquals(
      errorsModule.classifyStatusCode(402),
      errorsModule.InsufficientCreditsError,
    );
  });

  it("should classify 400 as BadRequestError", () => {
    assertEquals(
      errorsModule.classifyStatusCode(400),
      errorsModule.BadRequestError,
    );
  });

  it("should classify 500/503/529 as ServiceUnavailableError", () => {
    assertEquals(
      errorsModule.classifyStatusCode(500),
      errorsModule.ServiceUnavailableError,
    );
    assertEquals(
      errorsModule.classifyStatusCode(503),
      errorsModule.ServiceUnavailableError,
    );
    assertEquals(
      errorsModule.classifyStatusCode(529),
      errorsModule.ServiceUnavailableError,
    );
  });

  it("should return null for unknown status codes", () => {
    assertEquals(errorsModule.classifyStatusCode(404), null);
    assertEquals(errorsModule.classifyStatusCode(502), null);
  });
});

describe("classifyAndWrap", () => {
  it("should wrap with classified error", () => {
    const original = new Error("rate limited");
    const wrapped = errorsModule.classifyAndWrap("anthropic", 429, original);
    assertInstanceOf(wrapped, errorsModule.RateLimitedError);
    assertEquals(wrapped.provider, "anthropic");
    assertEquals(wrapped.cause, original);
  });

  it("should wrap unknown status as generic AiError", () => {
    const original = new Error("not found");
    const wrapped = errorsModule.classifyAndWrap("openai", 404, original);
    assertInstanceOf(wrapped, errorsModule.AiError);
    assertEquals(wrapped.statusCode, 404);
  });
});
