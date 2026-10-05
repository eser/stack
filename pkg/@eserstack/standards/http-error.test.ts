// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as httpError from "./http-error.ts";

Deno.test("HttpError should create error with status and message", () => {
  const error = new httpError.HttpError(404, "User not found");

  assert.assertEquals(error.status, 404);
  assert.assertEquals(error.message, "User not found");
  assert.assertEquals(error.name, "HttpError");
  assert.assertInstanceOf(error, Error);
});

Deno.test("HttpError should use default message from status code", () => {
  const error = new httpError.HttpError(404);

  assert.assertEquals(error.status, 404);
  assert.assertEquals(error.message, "Not Found");
});

Deno.test("HttpError should handle various status codes", () => {
  const testCases: Array<
    { status: 400 | 401 | 403 | 404 | 500; expected: string }
  > = [
    { status: 400, expected: "Bad Request" },
    { status: 401, expected: "Unauthorized" },
    { status: 403, expected: "Forbidden" },
    { status: 404, expected: "Not Found" },
    { status: 500, expected: "Internal Server Error" },
  ];

  for (const { status, expected } of testCases) {
    const error = new httpError.HttpError(status);
    assert.assertEquals(error.message, expected);
    assert.assertEquals(error.status, status);
  }
});

Deno.test("isHttpError should correctly identify HttpError instances", () => {
  const notFoundError = new httpError.HttpError(404);
  const regularError = new Error("regular");
  const stringValue = "not an error";
  const nullValue = null;

  assert.assertEquals(httpError.isHttpError(notFoundError), true);
  assert.assertEquals(httpError.isHttpError(regularError), false);
  assert.assertEquals(httpError.isHttpError(stringValue), false);
  assert.assertEquals(httpError.isHttpError(nullValue), false);
});

// Table-driven tests for HTTP error helper functions
const helperTestCases = [
  {
    helper: httpError.badRequest,
    status: 400,
    message: "Invalid input",
    defaultMsg: "Bad Request",
    name: "badRequest",
  },
  {
    helper: httpError.unauthorized,
    status: 401,
    message: "Login required",
    defaultMsg: "Unauthorized",
    name: "unauthorized",
  },
  {
    helper: httpError.forbidden,
    status: 403,
    message: "Access denied",
    defaultMsg: "Forbidden",
    name: "forbidden",
  },
  {
    helper: httpError.notFound,
    status: 404,
    message: "Resource not found",
    defaultMsg: "Not Found",
    name: "notFound",
  },
  {
    helper: httpError.conflict,
    status: 409,
    message: "Resource conflict",
    defaultMsg: "Conflict",
    name: "conflict",
  },
  {
    helper: httpError.unprocessableEntity,
    status: 422,
    message: "Validation failed",
    defaultMsg: "Unprocessable Entity",
    name: "unprocessableEntity",
  },
  {
    helper: httpError.tooManyRequests,
    status: 429,
    message: "Rate limit exceeded",
    defaultMsg: "Too Many Requests",
    name: "tooManyRequests",
  },
  {
    helper: httpError.internalServerError,
    status: 500,
    message: "Something went wrong",
    defaultMsg: "Internal Server Error",
    name: "internalServerError",
  },
  {
    helper: httpError.serviceUnavailable,
    status: 503,
    message: "Service is down",
    defaultMsg: "Service Unavailable",
    name: "serviceUnavailable",
  },
] as const;

for (const { helper, status, message, defaultMsg, name } of helperTestCases) {
  Deno.test(`${name} helper should create ${status} error with custom message`, () => {
    const error = helper(message);
    assert.assertEquals(error.status, status);
    assert.assertEquals(error.message, message);
  });

  Deno.test(`${name} helper should use default message when none provided`, () => {
    const error = helper();
    assert.assertEquals(error.status, status);
    assert.assertEquals(error.message, defaultMsg);
  });
}

Deno.test("HttpError can be caught and inspected", () => {
  const throwAndCatch = (): { status: number; message: string } | null => {
    try {
      throw new httpError.HttpError(403, "Access denied");
    } catch (e) {
      if (httpError.isHttpError(e)) {
        return { status: e.status, message: e.message };
      }
      return null;
    }
  };

  const result = throwAndCatch();
  assert.assertNotEquals(result, null);
  assert.assertEquals(result?.status, 403);
  assert.assertEquals(result?.message, "Access denied");
});
