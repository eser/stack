// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as errorsModule from "./errors.ts";

bdd.describe("AiError hierarchy", () => {
  bdd.it("should create a base AiError", () => {
    const err = new errorsModule.AiError("test error", {
      provider: "openai",
      statusCode: 500,
    });
    assert.assertInstanceOf(err, Error);
    assert.assertInstanceOf(err, errorsModule.AiError);
    assert.assertEquals(err.message, "test error");
    assert.assertEquals(err.provider, "openai");
    assert.assertEquals(err.statusCode, 500);
  });

  bdd.it("should default provider and statusCode to null", () => {
    const err = new errorsModule.AiError("test");
    assert.assertEquals(err.provider, null);
    assert.assertEquals(err.statusCode, null);
  });

  bdd.it("should create RateLimitedError", () => {
    const err = new errorsModule.RateLimitedError("too many requests", {
      provider: "anthropic",
    });
    assert.assertInstanceOf(err, errorsModule.AiError);
    assert.assertInstanceOf(err, errorsModule.RateLimitedError);
    assert.assertEquals(err.statusCode, 429);
  });

  bdd.it("should create AuthFailedError", () => {
    const err = new errorsModule.AuthFailedError("bad key");
    assert.assertInstanceOf(err, errorsModule.AuthFailedError);
    assert.assertEquals(err.statusCode, 401);
  });

  bdd.it("should create InsufficientCreditsError", () => {
    const err = new errorsModule.InsufficientCreditsError("no credits");
    assert.assertEquals(err.statusCode, 402);
  });

  bdd.it("should create BadRequestError", () => {
    const err = new errorsModule.BadRequestError("invalid params");
    assert.assertEquals(err.statusCode, 400);
  });

  bdd.it("should create ServiceUnavailableError", () => {
    const err = new errorsModule.ServiceUnavailableError("server down");
    assert.assertEquals(err.statusCode, 503);
  });

  bdd.it("should preserve cause in error chain", () => {
    const original = new Error("original error");
    const err = new errorsModule.RateLimitedError("rate limited", {
      cause: original,
    });
    assert.assertEquals(err.cause, original);
  });
});

bdd.describe("Registry errors", () => {
  bdd.it("should create ModelNotFoundError", () => {
    const err = new errorsModule.ModelNotFoundError("my-model");
    assert.assertInstanceOf(err, errorsModule.AiError);
    assert.assertEquals(err.message, 'Model "my-model" not found in registry');
  });

  bdd.it("should create ModelAlreadyExistsError", () => {
    const err = new errorsModule.ModelAlreadyExistsError("default");
    assert.assertEquals(
      err.message,
      'Model "default" already exists in registry',
    );
  });

  bdd.it("should create UnsupportedProviderError", () => {
    const err = new errorsModule.UnsupportedProviderError("unknown-provider");
    assert.assertEquals(
      err.message,
      'No factory registered for provider "unknown-provider"',
    );
  });
});

bdd.describe("classifyStatusCode", () => {
  bdd.it("should classify 429 as RateLimitedError", () => {
    assert.assertEquals(
      errorsModule.classifyStatusCode(429),
      errorsModule.RateLimitedError,
    );
  });

  bdd.it("should classify 401 as AuthFailedError", () => {
    assert.assertEquals(
      errorsModule.classifyStatusCode(401),
      errorsModule.AuthFailedError,
    );
  });

  bdd.it("should classify 402 as InsufficientCreditsError", () => {
    assert.assertEquals(
      errorsModule.classifyStatusCode(402),
      errorsModule.InsufficientCreditsError,
    );
  });

  bdd.it("should classify 400 as BadRequestError", () => {
    assert.assertEquals(
      errorsModule.classifyStatusCode(400),
      errorsModule.BadRequestError,
    );
  });

  bdd.it("should classify 500/503/529 as ServiceUnavailableError", () => {
    assert.assertEquals(
      errorsModule.classifyStatusCode(500),
      errorsModule.ServiceUnavailableError,
    );
    assert.assertEquals(
      errorsModule.classifyStatusCode(503),
      errorsModule.ServiceUnavailableError,
    );
    assert.assertEquals(
      errorsModule.classifyStatusCode(529),
      errorsModule.ServiceUnavailableError,
    );
  });

  bdd.it("should return null for unknown status codes", () => {
    assert.assertEquals(errorsModule.classifyStatusCode(404), null);
    assert.assertEquals(errorsModule.classifyStatusCode(502), null);
  });
});

bdd.describe("classifyAndWrap", () => {
  bdd.it("should wrap with classified error", () => {
    const original = new Error("rate limited");
    const wrapped = errorsModule.classifyAndWrap("anthropic", 429, original);
    assert.assertInstanceOf(wrapped, errorsModule.RateLimitedError);
    assert.assertEquals(wrapped.provider, "anthropic");
    assert.assertEquals(wrapped.cause, original);
  });

  bdd.it("should wrap unknown status as generic AiError", () => {
    const original = new Error("not found");
    const wrapped = errorsModule.classifyAndWrap("openai", 404, original);
    assert.assertInstanceOf(wrapped, errorsModule.AiError);
    assert.assertEquals(wrapped.statusCode, 404);
  });
});
