// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as auth from "./auth.ts";

const PORT = 3000;

const req = (url: string, init?: RequestInit): Request =>
  new Request(url, init);

Deno.test("createToken mints a fresh 32-byte hex token each call", () => {
  const a = auth.createToken();
  const b = auth.createToken();

  assert.assertEquals(a.length, 64);
  assert.assert(/^[0-9a-f]{64}$/.test(a));
  assert.assert(a !== b, "tokens must not repeat");
});

Deno.test("query token: only the exact value is accepted", () => {
  const token = auth.createToken();

  assert.assert(
    auth.hasValidQueryToken(
      req(`http://localhost:${PORT}/mux?token=${token}`),
      token,
    ),
  );

  // The attack this exists to stop: a page on another origin dialling /mux.
  assert.assertFalse(
    auth.hasValidQueryToken(req(`http://localhost:${PORT}/mux`), token),
  );
  assert.assertFalse(
    auth.hasValidQueryToken(req(`http://localhost:${PORT}/mux?token=`), token),
  );
  assert.assertFalse(
    auth.hasValidQueryToken(
      req(`http://localhost:${PORT}/mux?token=${token}x`),
      token,
    ),
  );
  assert.assertFalse(
    auth.hasValidQueryToken(
      req(`http://localhost:${PORT}/mux?token=${"0".repeat(64)}`),
      token,
    ),
  );
});

Deno.test("header token: only the exact value is accepted", () => {
  const token = auth.createToken();

  assert.assert(
    auth.hasValidHeaderToken(
      req(`http://localhost:${PORT}/api/tab`, {
        method: "POST",
        headers: { [auth.TOKEN_HEADER]: token },
      }),
      token,
    ),
  );

  assert.assertFalse(
    auth.hasValidHeaderToken(
      req(`http://localhost:${PORT}/api/tab`, { method: "POST" }),
      token,
    ),
  );
});

Deno.test("origin allowlist covers the three loopback spellings", () => {
  for (const origin of [
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    `http://[::1]:${PORT}`,
  ]) {
    assert.assert(
      auth.isOriginAllowed(
        req(`http://localhost:${PORT}/mux`, { headers: { origin } }),
        PORT,
      ),
      `${origin} should be allowed`,
    );
  }
});

Deno.test("origin allowlist rejects foreign and same-host-other-port origins", () => {
  for (const origin of [
    "https://evil.example",
    "http://localhost:9999",
    "http://192.168.1.10:3000",
    "null",
  ]) {
    assert.assertFalse(
      auth.isOriginAllowed(
        req(`http://localhost:${PORT}/mux`, { headers: { origin } }),
        PORT,
      ),
      `${origin} should be rejected`,
    );
  }
});

Deno.test("a missing Origin is allowed; the token is what gates non-browsers", () => {
  assert.assert(
    auth.isOriginAllowed(req(`http://localhost:${PORT}/mux`), PORT),
  );
});

Deno.test("only application/json passes the content-type gate", () => {
  const post = (contentType: string): Request =>
    req(`http://localhost:${PORT}/api/tab`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: "{}",
    });

  assert.assert(auth.hasJsonContentType(post("application/json")));
  assert.assert(
    auth.hasJsonContentType(post("application/json; charset=utf-8")),
  );

  // The three types an HTML form can post cross-origin without a preflight.
  assert.assertFalse(
    auth.hasJsonContentType(post("application/x-www-form-urlencoded")),
  );
  assert.assertFalse(auth.hasJsonContentType(post("multipart/form-data")));
  assert.assertFalse(auth.hasJsonContentType(post("text/plain")));
});
