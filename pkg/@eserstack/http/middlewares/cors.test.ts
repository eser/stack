// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { cors } from "./cors.ts";

const createRequest = (
  method: string,
  headers?: Record<string, string>,
): Request => {
  return new Request("http://localhost/test", {
    method,
    headers,
  });
};

const okHandler = () => new Response("OK", { status: 200 });

Deno.test("cors should allow all origins by default", async () => {
  const middleware = cors();
  const req = createRequest("GET", { Origin: "https://example.com" });

  const response = await middleware(req, okHandler);

  assert.assertEquals(
    response.headers.get("Access-Control-Allow-Origin"),
    "*",
  );
});

Deno.test("cors should handle preflight OPTIONS request", async () => {
  const middleware = cors();
  const req = createRequest("OPTIONS", { Origin: "https://example.com" });

  const response = await middleware(req, okHandler);

  assert.assertEquals(response.status, 204);
  assert.assertEquals(
    response.headers.get("Access-Control-Allow-Origin"),
    "*",
  );
  assert.assertExists(response.headers.get("Access-Control-Allow-Methods"));
});

Deno.test("cors should allow specific origins", async () => {
  const middleware = cors({
    origin: ["https://allowed.com", "https://also-allowed.com"],
  });

  // Allowed origin
  const allowedReq = createRequest("GET", { Origin: "https://allowed.com" });
  const allowedRes = await middleware(allowedReq, okHandler);
  assert.assertEquals(
    allowedRes.headers.get("Access-Control-Allow-Origin"),
    "https://allowed.com",
  );

  // Not allowed origin - header should not be set
  const notAllowedReq = createRequest("GET", {
    Origin: "https://not-allowed.com",
  });
  const notAllowedRes = await middleware(notAllowedReq, okHandler);
  assert.assertEquals(
    notAllowedRes.headers.get("Access-Control-Allow-Origin"),
    null,
  );
});

Deno.test("cors should support origin as function", async () => {
  const middleware = cors({
    origin: (origin) => origin.endsWith(".example.com"),
  });

  const allowedReq = createRequest("GET", {
    Origin: "https://app.example.com",
  });
  const allowedRes = await middleware(allowedReq, okHandler);
  assert.assertEquals(
    allowedRes.headers.get("Access-Control-Allow-Origin"),
    "https://app.example.com",
  );

  // Not allowed origin - header should not be set
  const notAllowedReq = createRequest("GET", { Origin: "https://other.com" });
  const notAllowedRes = await middleware(notAllowedReq, okHandler);
  assert.assertEquals(
    notAllowedRes.headers.get("Access-Control-Allow-Origin"),
    null,
  );
});

Deno.test("cors should set credentials header when enabled", async () => {
  const middleware = cors({ credentials: true });
  const req = createRequest("GET", { Origin: "https://example.com" });

  const response = await middleware(req, okHandler);

  assert.assertEquals(
    response.headers.get("Access-Control-Allow-Credentials"),
    "true",
  );
});

Deno.test("cors should set max-age in preflight", async () => {
  const middleware = cors({ maxAge: 86400 });
  const req = createRequest("OPTIONS", { Origin: "https://example.com" });

  const response = await middleware(req, okHandler);

  assert.assertEquals(
    response.headers.get("Access-Control-Max-Age"),
    "86400",
  );
});

Deno.test("cors should set allowed headers in preflight", async () => {
  const middleware = cors({
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  const req = createRequest("OPTIONS", { Origin: "https://example.com" });

  const response = await middleware(req, okHandler);

  assert.assertEquals(
    response.headers.get("Access-Control-Allow-Headers"),
    "Content-Type, Authorization",
  );
});

Deno.test("cors should mirror requested headers if not specified", async () => {
  const middleware = cors();
  const req = createRequest("OPTIONS", {
    Origin: "https://example.com",
    "Access-Control-Request-Headers": "X-Custom-Header",
  });

  const response = await middleware(req, okHandler);

  assert.assertEquals(
    response.headers.get("Access-Control-Allow-Headers"),
    "X-Custom-Header",
  );
});

Deno.test("cors should set exposed headers", async () => {
  const middleware = cors({
    exposedHeaders: ["X-Request-Id", "X-Rate-Limit"],
  });
  const req = createRequest("GET", { Origin: "https://example.com" });

  const response = await middleware(req, okHandler);

  assert.assertEquals(
    response.headers.get("Access-Control-Expose-Headers"),
    "X-Request-Id, X-Rate-Limit",
  );
});

Deno.test("cors should set Vary header for specific origins", async () => {
  const middleware = cors({ origin: "https://example.com" });
  const req = createRequest("GET", { Origin: "https://example.com" });

  const response = await middleware(req, okHandler);

  const varyHeader = response.headers.get("Vary");
  assert.assertStringIncludes(varyHeader ?? "", "Origin");
});

Deno.test("cors should pass through response from next handler", async () => {
  const middleware = cors();
  const req = createRequest("GET", { Origin: "https://example.com" });

  const response = await middleware(
    req,
    () => Response.json({ data: "test" }, { status: 201 }),
  );

  assert.assertEquals(response.status, 201);
  const body = await response.json();
  assert.assertEquals(body.data, "test");
});
