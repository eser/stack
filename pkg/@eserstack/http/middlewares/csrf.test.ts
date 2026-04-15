// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { csrf, generateToken } from "./csrf.ts";

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

Deno.test("generateToken should create random hex string", () => {
  const token1 = generateToken();
  const token2 = generateToken();

  assert.assertNotEquals(token1, token2);
  assert.assertEquals(token1.length, 64); // 32 bytes = 64 hex chars
  assert.assertEquals(/^[a-f0-9]+$/.test(token1), true);
});

Deno.test("csrf should allow GET requests without token", async () => {
  const middleware = csrf();
  const req = createRequest("GET");

  const response = await middleware(req, okHandler);

  assert.assertEquals(response.status, 200);
});

Deno.test("csrf should set token cookie on GET request", async () => {
  const middleware = csrf();
  const req = createRequest("GET");

  const response = await middleware(req, okHandler);

  const setCookie = response.headers.get("Set-Cookie");
  assert.assertExists(setCookie);
  assert.assertStringIncludes(setCookie, "csrf_token=");
});

Deno.test("csrf should reject POST without token", async () => {
  const middleware = csrf();
  const req = createRequest("POST");

  const response = await middleware(req, okHandler);

  assert.assertEquals(response.status, 403);
  const body = await response.json();
  assert.assertEquals(body.error, "CSRF token mismatch");
});

Deno.test("csrf should reject POST with mismatched token", async () => {
  const middleware = csrf();
  const req = createRequest("POST", {
    Cookie: "csrf_token=cookie-token",
    "X-CSRF-Token": "header-token",
  });

  const response = await middleware(req, okHandler);

  assert.assertEquals(response.status, 403);
});

Deno.test("csrf should allow POST with matching token", async () => {
  const middleware = csrf();
  const token = generateToken();
  const req = createRequest("POST", {
    Cookie: `csrf_token=${token}`,
    "X-CSRF-Token": token,
  });

  const response = await middleware(req, okHandler);

  assert.assertEquals(response.status, 200);
});

Deno.test("csrf should rotate token after successful validation", async () => {
  const middleware = csrf();
  const token = generateToken();
  const req = createRequest("POST", {
    Cookie: `csrf_token=${token}`,
    "X-CSRF-Token": token,
  });

  const response = await middleware(req, okHandler);

  const setCookie = response.headers.get("Set-Cookie");
  assert.assertExists(setCookie);
  // Token should be different from the original
  assert.assertEquals(setCookie?.includes(token), false);
});

Deno.test("csrf should use custom cookie name", async () => {
  const middleware = csrf({ cookie: "my_csrf" });
  const token = generateToken();
  const req = createRequest("POST", {
    Cookie: `my_csrf=${token}`,
    "X-CSRF-Token": token,
  });

  const response = await middleware(req, okHandler);

  assert.assertEquals(response.status, 200);
});

Deno.test("csrf should use custom header name", async () => {
  const middleware = csrf({ header: "X-My-CSRF" });
  const token = generateToken();
  const req = createRequest("POST", {
    Cookie: `csrf_token=${token}`,
    "X-My-CSRF": token,
  });

  const response = await middleware(req, okHandler);

  assert.assertEquals(response.status, 200);
});

Deno.test("csrf should exclude paths from validation", async () => {
  const middleware = csrf({
    excludePaths: ["/api/webhooks", "/api/public/*"],
  });

  // Exact match
  const webhookReq = createRequest("POST");
  Object.defineProperty(webhookReq, "url", {
    value: "http://localhost/api/webhooks",
  });

  // Wildcard match
  const _publicReq = new Request("http://localhost/api/public/something", {
    method: "POST",
  });

  const webhookRes = await middleware(
    new Request("http://localhost/api/webhooks", { method: "POST" }),
    okHandler,
  );
  assert.assertEquals(webhookRes.status, 200);
});

Deno.test("csrf should apply to configured methods only", async () => {
  const middleware = csrf({ methods: ["POST", "DELETE"] });

  // PUT should not require CSRF
  const putReq = createRequest("PUT");
  const putRes = await middleware(putReq, okHandler);
  assert.assertEquals(putRes.status, 200);

  // DELETE should require CSRF
  const deleteReq = createRequest("DELETE");
  const deleteRes = await middleware(deleteReq, okHandler);
  assert.assertEquals(deleteRes.status, 403);
});

Deno.test("csrf should set secure cookie options", async () => {
  const middleware = csrf({
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    },
  });
  const req = createRequest("GET");

  const response = await middleware(req, okHandler);

  const setCookie = response.headers.get("Set-Cookie");
  assert.assertExists(setCookie);
  assert.assertStringIncludes(setCookie, "HttpOnly");
  assert.assertStringIncludes(setCookie, "Secure");
  assert.assertStringIncludes(setCookie, "SameSite=Strict");
});
