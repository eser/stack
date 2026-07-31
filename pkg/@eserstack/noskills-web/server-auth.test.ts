// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * End-to-end checks against a live server: the attack in the audit finding must
 * actually be refused on the wire, not just by the guard helpers in isolation.
 */

import { assertEquals } from "@std/assert";
import { startServer } from "./server.ts";

const PORT = 39117;
const TOKEN = "test-token-" + "a".repeat(52);

const withServer = async (
  fn: (base: string) => Promise<void>,
): Promise<void> => {
  const previous = Deno.env.get("NOSKILLS_WEB_TOKEN");
  Deno.env.set("NOSKILLS_WEB_TOKEN", TOKEN);

  const controller = new AbortController();
  const running = startServer({
    root: Deno.cwd(),
    port: PORT,
    open: false,
    signal: controller.signal,
  });

  // Give Deno.serve a tick to bind.
  await new Promise((resolve) => setTimeout(resolve, 150));

  try {
    await fn(`http://127.0.0.1:${PORT}`);
  } finally {
    controller.abort();

    if (previous === undefined) {
      Deno.env.delete("NOSKILLS_WEB_TOKEN");
    } else {
      Deno.env.set("NOSKILLS_WEB_TOKEN", previous);
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

      assertEquals(res.status, 403);
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

      assertEquals(res.status, 403);
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

      assertEquals(res.status, 403);
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

      assertEquals(res.status, 403);
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

      assertEquals(res.status, 200);
      assertEquals(
        html.includes(`<meta name="noskills-token" content="${TOKEN}" />`),
        true,
        "dashboard must hand the browser its token",
      );
    }),
});
