// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * End-to-end checks against a live server: the attack in the audit finding must
 * actually be refused on the wire, not just by the guard helpers in isolation.
 */

import * as assert from "@std/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as server from "./server.ts";

const TOKEN = "test-token-" + "a".repeat(52);

const withServer = async (
  fn: (base: string) => Promise<void>,
): Promise<void> => {
  const previous = runtime.env.get("NOSKILLS_WEB_TOKEN");
  runtime.env.set("NOSKILLS_WEB_TOKEN", TOKEN);

  // Port 0 lets the system pick a free port; onListen reports it once the
  // server accepts connections.
  const controller = new AbortController();
  const listening = Promise.withResolvers<number>();
  const running = server.startServer({
    root: runtime.process.cwd(),
    port: 0,
    open: false,
    signal: controller.signal,
    onListen: (address) => listening.resolve(address.port),
  });
  // A server that cannot bind rejects before it listens.
  running.catch((error: unknown) => listening.reject(error));

  try {
    const port = await listening.promise;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    controller.abort();

    if (previous === undefined) {
      runtime.env.delete("NOSKILLS_WEB_TOKEN");
    } else {
      runtime.env.set("NOSKILLS_WEB_TOKEN", previous);
    }

    await running.catch(() => {});
  }
};

Deno.test({
  name: "/mux upgrade without a token is refused",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/mux`, {
        headers: { upgrade: "websocket" },
      });
      await res.body?.cancel();

      assert.assertEquals(res.status, 403);
    }),
});

Deno.test({
  name: "/mux upgrade from a foreign Origin is refused even with the token",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/mux?token=${TOKEN}`, {
        headers: { upgrade: "websocket", origin: "https://evil.example" },
      });
      await res.body?.cancel();

      assert.assertEquals(res.status, 403);
    }),
});

Deno.test({
  name: "POST /api/tab without a token is refused",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/api/tab`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      await res.body?.cancel();

      assert.assertEquals(res.status, 403);
    }),
});

Deno.test({
  name: "POST with a form content-type is refused (CSRF-simple request)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/api/tab`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-noskills-token": TOKEN,
        },
        body: "a=1",
      });
      await res.body?.cancel();

      assert.assertEquals(res.status, 403);
    }),
});

Deno.test({
  name: "the server's own Origin passes on the port the system picked",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      // Started with port 0: the Origin check must compare against the bound
      // port, or the dashboard's own requests would be refused.
      const res = await fetch(`${base}/api/spec/any-spec/no-such-action`, {
        method: "POST",
        headers: {
          origin: base,
          "content-type": "application/json",
          "x-noskills-token": TOKEN,
        },
        body: "{}",
      });
      const body = await res.json();

      assert.assertEquals(res.status, 400);
      assert.assertEquals(body.error, "Unknown action: no-such-action");
    }),
});

Deno.test({
  name: "a JSON body that is not an object is read as {}, not a server error",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/api/spec/any-spec/no-such-action`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-noskills-token": TOKEN,
        },
        body: "null",
      });
      const body = await res.json();

      assert.assertEquals(res.status, 400);
      assert.assertEquals(body, {
        ok: false,
        error: "Unknown action: no-such-action",
      });
    }),
});

Deno.test({
  name: "the dashboard still serves, and embeds the token for the browser",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/`);
      const html = await res.text();

      assert.assertEquals(res.status, 200);
      assert.assertEquals(
        html.includes(`<meta name="noskills-token" content="${TOKEN}" />`),
        true,
        "dashboard must hand the browser its token",
      );
    }),
});
