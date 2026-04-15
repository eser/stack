// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  badRequest,
  conflict,
  forbidden,
  HttpError,
  internalServerError,
  isHttpError,
  notFound,
  serviceUnavailable,
  tooManyRequests,
  unauthorized,
  unprocessableEntity,
} from "./http-error.ts";

Deno.test("HttpError should create error with status and message", () => {
  const error = new HttpError(404, "User not found");

  assert.assertEquals(error.status, 404);
  assert.assertEquals(error.message, "User not found");
  assert.assertEquals(error.name, "HttpError");
  assert.assertInstanceOf(error, Error);
});

Deno.test("HttpError should use default message from status code", () => {
  const error = new HttpError(404);

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
    const error = new HttpError(status);
    assert.assertEquals(error.message, expected);
    assert.assertEquals(error.status, status);
  }
});

Deno.test("isHttpError should correctly identify HttpError instances", () => {
  const httpError = new HttpError(404);
  const regularError = new Error("regular");
  const stringValue = "not an error";
  const nullValue = null;

  assert.assertEquals(isHttpError(httpError), true);
  assert.assertEquals(isHttpError(regularError), false);
  assert.assertEquals(isHttpError(stringValue), false);
  assert.assertEquals(isHttpError(nullValue), false);
});

// Table-driven tests for HTTP error helper functions
const helperTestCases = [
  {
    helper: badRequest,
    status: 400,
    message: "Invalid input",
    defaultMsg: "Bad Request",
    name: "badRequest",
  },
  {
    helper: unauthorized,
    status: 401,
    message: "Login required",
    defaultMsg: "Unauthorized",
    name: "unauthorized",
  },
  {
    helper: forbidden,
    status: 403,
    message: "Access denied",
    defaultMsg: "Forbidden",
    name: "forbidden",
  },
  {
    helper: notFound,
    status: 404,
    message: "Resource not found",
    defaultMsg: "Not Found",
    name: "notFound",
  },
  {
    helper: conflict,
    status: 409,
    message: "Resource conflict",
    defaultMsg: "Conflict",
    name: "conflict",
  },
  {
    helper: unprocessableEntity,
    status: 422,
    message: "Validation failed",
    defaultMsg: "Unprocessable Entity",
    name: "unprocessableEntity",
  },
  {
    helper: tooManyRequests,
    status: 429,
    message: "Rate limit exceeded",
    defaultMsg: "Too Many Requests",
    name: "tooManyRequests",
  },
  {
    helper: internalServerError,
    status: 500,
    message: "Something went wrong",
    defaultMsg: "Internal Server Error",
    name: "internalServerError",
  },
  {
    helper: serviceUnavailable,
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
      throw new HttpError(403, "Access denied");
    } catch (e) {
      if (isHttpError(e)) {
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
