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

Deno.test("badRequest helper should create 400 error", () => {
  const error = badRequest("Invalid input");
  assert.assertEquals(error.status, 400);
  assert.assertEquals(error.message, "Invalid input");

  const defaultError = badRequest();
  assert.assertEquals(defaultError.status, 400);
  assert.assertEquals(defaultError.message, "Bad Request");
});

Deno.test("unauthorized helper should create 401 error", () => {
  const error = unauthorized("Login required");
  assert.assertEquals(error.status, 401);
  assert.assertEquals(error.message, "Login required");
});

Deno.test("forbidden helper should create 403 error", () => {
  const error = forbidden("Access denied");
  assert.assertEquals(error.status, 403);
  assert.assertEquals(error.message, "Access denied");
});

Deno.test("notFound helper should create 404 error", () => {
  const error = notFound("Resource not found");
  assert.assertEquals(error.status, 404);
  assert.assertEquals(error.message, "Resource not found");
});

Deno.test("conflict helper should create 409 error", () => {
  const error = conflict("Resource conflict");
  assert.assertEquals(error.status, 409);
  assert.assertEquals(error.message, "Resource conflict");
});

Deno.test("unprocessableEntity helper should create 422 error", () => {
  const error = unprocessableEntity("Validation failed");
  assert.assertEquals(error.status, 422);
  assert.assertEquals(error.message, "Validation failed");
});

Deno.test("tooManyRequests helper should create 429 error", () => {
  const error = tooManyRequests("Rate limit exceeded");
  assert.assertEquals(error.status, 429);
  assert.assertEquals(error.message, "Rate limit exceeded");
});

Deno.test("internalServerError helper should create 500 error", () => {
  const error = internalServerError("Something went wrong");
  assert.assertEquals(error.status, 500);
  assert.assertEquals(error.message, "Something went wrong");
});

Deno.test("serviceUnavailable helper should create 503 error", () => {
  const error = serviceUnavailable("Service is down");
  assert.assertEquals(error.status, 503);
  assert.assertEquals(error.message, "Service is down");
});

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
