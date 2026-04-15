// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { csp, generateNonce } from "./csp.ts";

const createRequest = (): Request => {
  return new Request("http://localhost/test", { method: "GET" });
};

const okHandler = () => new Response("OK", { status: 200 });

Deno.test("generateNonce should create random base64 string", () => {
  const nonce1 = generateNonce();
  const nonce2 = generateNonce();

  assert.assertNotEquals(nonce1, nonce2);
  assert.assertEquals(typeof nonce1, "string");
  assert.assertEquals(nonce1.length > 0, true);
});

Deno.test("csp should add default CSP header", async () => {
  const middleware = csp();
  const req = createRequest();

  const response = await middleware(req, okHandler);

  const cspHeader = response.headers.get("Content-Security-Policy");
  assert.assertExists(cspHeader);
  assert.assertStringIncludes(cspHeader, "default-src 'self'");
});

Deno.test("csp should use custom directives", async () => {
  const middleware = csp({
    directives: {
      "default-src": "'none'",
      "script-src": ["'self'", "https://cdn.example.com"],
      "img-src": "'self' data:",
    },
  });
  const req = createRequest();

  const response = await middleware(req, okHandler);

  const cspHeader = response.headers.get("Content-Security-Policy");
  assert.assertExists(cspHeader);
  assert.assertStringIncludes(cspHeader, "default-src 'none'");
  assert.assertStringIncludes(
    cspHeader,
    "script-src 'self' https://cdn.example.com",
  );
  assert.assertStringIncludes(cspHeader, "img-src 'self' data:");
});

Deno.test("csp should use report-only header when specified", async () => {
  const middleware = csp({ reportOnly: true });
  const req = createRequest();

  const response = await middleware(req, okHandler);

  assert.assertExists(
    response.headers.get("Content-Security-Policy-Report-Only"),
  );
  assert.assertEquals(response.headers.get("Content-Security-Policy"), null);
});

Deno.test("csp should add nonce when useNonce is true", async () => {
  const middleware = csp({ useNonce: true });
  const req = createRequest();

  const response = await middleware(req, okHandler);

  const cspHeader = response.headers.get("Content-Security-Policy");
  assert.assertExists(cspHeader);
  assert.assertStringIncludes(cspHeader, "'nonce-");

  const nonceHeader = response.headers.get("X-CSP-Nonce");
  assert.assertExists(nonceHeader);
});

Deno.test("csp should generate different nonces for different requests", async () => {
  const middleware = csp({ useNonce: true });

  const response1 = await middleware(createRequest(), okHandler);
  const response2 = await middleware(createRequest(), okHandler);

  const nonce1 = response1.headers.get("X-CSP-Nonce");
  const nonce2 = response2.headers.get("X-CSP-Nonce");

  assert.assertNotEquals(nonce1, nonce2);
});

Deno.test("csp should merge nonce with existing script-src", async () => {
  const middleware = csp({
    directives: {
      "script-src": "'self' https://cdn.example.com",
    },
    useNonce: true,
  });
  const req = createRequest();

  const response = await middleware(req, okHandler);

  const cspHeader = response.headers.get("Content-Security-Policy");
  assert.assertExists(cspHeader);
  assert.assertStringIncludes(cspHeader, "'self'");
  assert.assertStringIncludes(cspHeader, "https://cdn.example.com");
  assert.assertStringIncludes(cspHeader, "'nonce-");
});

Deno.test("csp should merge nonce with array script-src", async () => {
  const middleware = csp({
    directives: {
      "script-src": ["'self'", "https://cdn.example.com"],
    },
    useNonce: true,
  });
  const req = createRequest();

  const response = await middleware(req, okHandler);

  const cspHeader = response.headers.get("Content-Security-Policy");
  assert.assertExists(cspHeader);
  assert.assertStringIncludes(cspHeader, "'nonce-");
});

Deno.test("csp should pass through response from next handler", async () => {
  const middleware = csp();
  const req = createRequest();

  const response = await middleware(
    req,
    () => Response.json({ data: "test" }, { status: 201 }),
  );

  assert.assertEquals(response.status, 201);
  const body = await response.json();
  assert.assertEquals(body.data, "test");
});

Deno.test("csp should preserve response headers", async () => {
  const middleware = csp();
  const req = createRequest();

  const response = await middleware(req, () =>
    new Response("OK", {
      headers: { "X-Custom-Header": "custom-value" },
    }));

  assert.assertEquals(
    response.headers.get("X-Custom-Header"),
    "custom-value",
  );
  assert.assertExists(response.headers.get("Content-Security-Policy"));
});
