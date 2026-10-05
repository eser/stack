// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as apiTypes from "./api-types.ts";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

Deno.test("jsonResponse sends the data as JSON with status 200", async () => {
  const response = apiTypes.jsonResponse({ id: 1, tags: ["a"] });

  assert.assertEquals(response.status, 200);
  assert.assertEquals(response.headers.get("content-type"), JSON_CONTENT_TYPE);
  assert.assertEquals(await response.json(), { id: 1, tags: ["a"] });
});

Deno.test("jsonResponse keeps the status and status text from init", async () => {
  const response = apiTypes.jsonResponse({ created: true }, {
    status: 201,
    statusText: "Created",
  });

  assert.assertEquals(response.status, 201);
  assert.assertEquals(response.statusText, "Created");
  assert.assertEquals(await response.json(), { created: true });
});

const headerForms: ReadonlyArray<{
  readonly name: string;
  readonly headers: HeadersInit;
}> = [
  { name: "a plain object", headers: { "Cache-Control": "no-store" } },
  {
    name: "a Headers instance",
    headers: new Headers({ "Cache-Control": "no-store" }),
  },
  { name: "a list of pairs", headers: [["Cache-Control", "no-store"]] },
];

for (const { name, headers } of headerForms) {
  Deno.test(`jsonResponse keeps headers given as ${name}`, async () => {
    const response = apiTypes.jsonResponse({ ok: true }, { headers });

    assert.assertEquals(response.headers.get("cache-control"), "no-store");
    assert.assertEquals(
      response.headers.get("content-type"),
      JSON_CONTENT_TYPE,
    );
    await response.body?.cancel();
  });
}

Deno.test("jsonResponse lets the caller's content type win, in any letter case", async () => {
  const response = apiTypes.jsonResponse({ ok: true }, {
    headers: { "content-type": "application/problem+json" },
  });

  assert.assertEquals(
    response.headers.get("content-type"),
    "application/problem+json",
  );
  await response.body?.cancel();
});

Deno.test("errorResponse defaults to status 500 without details", async () => {
  const response = apiTypes.errorResponse("database unavailable");

  assert.assertEquals(response.status, 500);
  assert.assertEquals(await response.json(), {
    error: "database unavailable",
  });
});

Deno.test("errorResponse includes details when given, even falsy ones", async () => {
  const withObject = apiTypes.errorResponse("invalid input", 422, {
    field: "email",
  });
  assert.assertEquals(withObject.status, 422);
  assert.assertEquals(await withObject.json(), {
    error: "invalid input",
    details: { field: "email" },
  });

  const withZero = apiTypes.errorResponse("quota reached", 429, 0);
  assert.assertEquals(await withZero.json(), {
    error: "quota reached",
    details: 0,
  });
});

const httpErrorCases: ReadonlyArray<{
  readonly helper: keyof typeof apiTypes.HttpError;
  readonly status: number;
  readonly message: string;
}> = [
  { helper: "badRequest", status: 400, message: "Bad Request" },
  { helper: "unauthorized", status: 401, message: "Unauthorized" },
  { helper: "forbidden", status: 403, message: "Forbidden" },
  { helper: "notFound", status: 404, message: "Not Found" },
  { helper: "methodNotAllowed", status: 405, message: "Method Not Allowed" },
  { helper: "conflict", status: 409, message: "Conflict" },
  { helper: "unprocessable", status: 422, message: "Unprocessable Entity" },
  { helper: "internal", status: 500, message: "Internal Server Error" },
];

for (const { helper, status, message } of httpErrorCases) {
  Deno.test(`HttpError.${helper} answers ${status} with a default message`, async () => {
    const response = apiTypes.HttpError[helper]();

    assert.assertEquals(response.status, status);
    assert.assertEquals(await response.json(), { error: message });
  });
}

Deno.test("HttpError helpers take a custom message", async () => {
  const response = apiTypes.HttpError.notFound("story 42 does not exist");

  assert.assertEquals(response.status, 404);
  assert.assertEquals(await response.json(), {
    error: "story 42 does not exist",
  });
});
